import { CONFIG, interactionDist } from './config.js';
import { getEnemyDebugMults, getEnemySpeedMult, getMaxActiveEnemies } from './debug.js';
import { LaneEnemy } from './enemy.js';
import { LaneSoldier } from './soldier.js';
import { vibrate } from './utils.js';

export class DefenseLane {
  constructor(gameState) {
    this.game = gameState;
    this.soldiers = [];
    this.enemies = [];
    this.killCount = 0;
    this.portalBursts = [];
    this.combatEffects = [];
  }

  get lane() {
    return CONFIG.defenseLane;
  }

  _getCastleBounds() {
    const L = this.lane;
    const w = CONFIG.castle.width;
    const h = CONFIG.castle.height;
    const left = L.xLeft + (L.castleMarginLeft ?? 8);
    const bottom = L.yBottom - (L.castleMarginBottom ?? 10);
    return {
      left,
      right: left + w,
      top: bottom - h,
      bottom,
      cx: left + w / 2,
      cy: bottom - h / 2,
      width: w,
      height: h,
    };
  }

  canSpawnEnemy() {
    return this.enemies.filter((e) => !e.dead).length < getMaxActiveEnemies(this.game);
  }

  addEnemy(type, waveMult = 1) {
    if (!this.canSpawnEnemy()) return null;
    const portalX = this.lane.enemySpawnX;
    const spawnY =
      this.lane.portalYMin +
      Math.random() * (this.lane.portalYMax - this.lane.portalYMin);
    const spawnX = portalX + (Math.random() - 0.5) * (this.lane.portalSpawnWidth ?? 36);
    const e = new LaneEnemy(type, spawnX, spawnY, waveMult, getEnemyDebugMults(this.game));
    this.enemies.push(e);
    this._triggerPortalBurst(spawnX, spawnY, e.isBoss);
    return e;
  }

  _triggerPortalBurst(x, y, isBoss = false) {
    this.portalBursts.push({ x, y, t: 0, duration: isBoss ? 600 : 420, isBoss });
  }

  /** 从 Matter 球同步战斗单位（位置/合成/碰撞均由 physics 统一处理） */
  syncSoldiersFromPhysics() {
    const physics = this.game.physics;
    const prev = new Map(
      this.soldiers.filter((s) => s.fruitBodyId != null).map((s) => [s.fruitBodyId, s])
    );
    const next = [];
    for (const body of physics.getFruitBodies()) {
      const meta = physics.getMeta(body);
      if (!meta || meta.merging) continue;
      let s = prev.get(body.id);
      if (!s) {
        s = LaneSoldier.fromFruit(body, meta);
      } else {
        s.syncFromFruit(body, meta);
      }
      next.push(s);
    }
    this.soldiers = next;
  }

  update(dt, callbacks) {
    this.syncSoldiersFromPhysics();
    this._updateEnemies(dt);

    const activeSoldiers = this.soldiers.filter((s) => !s.dead);
    const aliveEnemies = this.enemies.filter((e) => !e.dead && !e.emerging);

    this._assignDuels(activeSoldiers, aliveEnemies);
    this._pushDuelStateToMeta(activeSoldiers);
    this._updateDuelMovement(dt, activeSoldiers, aliveEnemies);
    this._resolveCombat(dt, callbacks);
    this._checkCastle(callbacks);
    this._syncMetaAfterCombat();

    this.soldiers = this.soldiers.filter((s) => !s.dead || s.fade > 0);
    this.enemies = this.enemies.filter((e) => !e.dead || e.fade > 0);
    this._tickPortalBursts(dt);
    this._tickCombatFx(dt);
  }

  _syncMetaAfterCombat() {
    const physics = this.game.physics;
    for (const s of this.soldiers) {
      if (!s.fruitBodyId) continue;
      const body = physics.getBodyById(s.fruitBodyId);
      const meta = body && physics.getMeta(body);
      if (meta) s.syncToMeta(meta);
    }
  }

  _releaseInvalidPairs(soldiers, enemies) {
    for (const s of soldiers) {
      const e = s.pairedEnemy;
      if (!e || e.dead || !s.inSenseRange(e)) s.pairedEnemy = null;
    }
    for (const e of enemies) {
      const s = e.pairedSoldier;
      if (!s || s.dead || !e.inSenseOf(s)) {
        e.pairedSoldier = null;
        e.duelMode = 'march';
      }
    }
  }

  _pushDuelStateToMeta(soldiers) {
    const physics = this.game.physics;
    for (const s of soldiers) {
      if (!s.fruitBodyId) continue;
      const body = physics.getBodyById(s.fruitBodyId);
      const meta = body && physics.getMeta(body);
      if (meta) s.syncToMeta(meta);
    }
  }

  _assignDuels(soldiers, enemies) {
    this._releaseInvalidPairs(soldiers, enemies);

    const freeS = soldiers.filter((s) => !s.pairedEnemy);
    const freeE = enemies.filter((e) => !e.pairedSoldier);

    const candidates = [];
    for (const s of freeS) {
      for (const e of freeE) {
        if (!s.inSenseRange(e)) continue;
        candidates.push({ s, e, d: s.distTo(e) });
      }
    }
    candidates.sort((a, b) => a.d - b.d);

    const usedS = new Set();
    const usedE = new Set();
    for (const { s, e } of candidates) {
      if (usedS.has(s.id) || usedE.has(e.id)) continue;
      usedS.add(s.id);
      usedE.add(e.id);
      s.pairedEnemy = e;
      e.pairedSoldier = s;
      e.duelMode = 'fight';
    }

    for (const e of enemies) {
      if (!e.pairedSoldier) e.duelMode = 'castle';
    }
  }

  _getCastleMarchTarget() {
    const c = this._getCastleBounds();
    return { x: c.left + c.width * 0.45, y: c.bottom - c.height * 0.35 };
  }

  _steerEnemyToward(e, tx, ty, speed) {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x += (dx / len) * speed;
    e.y += (dy / len) * speed;
  }

  _updateDuelMovement(dt, soldiers, enemies) {
    const chaseS = (s) => s.moveSpeed * (dt / 1000);
    const spd = getEnemySpeedMult(this.game);
    const chaseE = (this.lane.enemyChaseSpeed ?? 20) * spd * (dt / 1000);
    const march = (this.lane.enemyMarchSpeed ?? 18) * spd * (dt / 1000);
    const castleTarget = this._getCastleMarchTarget();
    const physics = this.game.physics;

    for (const s of soldiers) {
      s.update(dt);
      const e = s.pairedEnemy;
      if (!e || e.dead) continue;
      if (s.canDuelAttack(e)) continue;
      const body = physics.getBodyById(s.fruitBodyId);
      if (body) {
        physics.nudgeBodyToward(body, e.x, e.y, chaseS(s), s.pairedEnemy ? 0.35 : 1);
      }
    }

    for (const e of enemies) {
      if (e.emerging) continue;

      if (e.duelMode === 'fight' && e.pairedSoldier) {
        const s = e.pairedSoldier;
        if (!s || s.dead) {
          e.pairedSoldier = null;
          e.duelMode = 'castle';
          continue;
        }
        if (e.inSenseOf(s)) continue;
        this._steerEnemyToward(e, s.x, s.y, chaseE);
        this._clampEnemyInLane(e);
        continue;
      }

      this._steerEnemyToward(e, castleTarget.x, castleTarget.y, march);
      this._clampEnemyInLane(e);
    }
  }

  _clampEnemyInLane(e) {
    const L = this.lane;
    e.y = Math.max(L.yTop + e.radius, Math.min(L.yBottom - e.radius, e.y));
    const castle = this._getCastleBounds();
    const minX = castle.left - e.radius * 0.35;
    e.x = Math.min(L.enemySpawnX + 15, Math.max(minX, e.x));
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) e.update(dt);
  }

  _resolveCombat(dt, { onDamage }) {
    const soldiers = this.soldiers.filter((s) => !s.dead);
    const enemies = this.enemies.filter((e) => !e.dead && !e.emerging);
    const physics = this.game.physics;

    for (const soldier of soldiers) {
      const target = soldier.pairedEnemy;
      if (!target || target.dead || !soldier.canDuelAttack(target)) continue;
      soldier.attackTimer -= dt / 1000;
      if (soldier.attackTimer > 0) continue;
      const atkSpd = soldier.cfg.attackSpeed ?? 1;
      soldier.attackTimer = CONFIG.combat.defaultAttackInterval / atkSpd;
      const dmg = soldier.getDamage();
      this._spawnAttackFx(soldier, target, 'soldier');
      if (target.takeDamage(dmg)) {
        target.pairedSoldier = null;
        soldier.pairedEnemy = null;
        this._onEnemyKilled(target, { onDamage });
      }
      onDamage?.(target.x, target.y - 20, `-${Math.round(dmg)}`, 'damage-enemy');
    }

    for (const enemy of enemies) {
      if (enemy.emerging || enemy.duelMode !== 'fight') continue;
      const target = enemy.pairedSoldier;
      if (!target || target.dead || !enemy.inSenseOf(target)) continue;
      enemy.attackTimer -= dt / 1000;
      if (enemy.attackTimer > 0) continue;
      const atkSpd = enemy.cfg.attackSpeed ?? 1;
      enemy.attackTimer = CONFIG.combat.defaultAttackInterval / atkSpd;
      this._spawnAttackFx(enemy, target, 'enemy');
      if (target.takeDamage(enemy.attack)) {
        target.pairedEnemy = null;
        enemy.pairedSoldier = null;
        const body = physics.getBodyById(target.fruitBodyId);
        if (body) {
          const meta = physics.getMeta(body);
          if (meta) {
            meta.dead = true;
            meta.fade = 0;
            meta.pairedEnemy = null;
          }
          physics.removeFruit(body);
        }
      }
      onDamage?.(target.x, target.y - 20, `-${enemy.attack}`, 'damage-soldier');
    }
  }

  _onEnemyKilled(enemy, { onDamage }) {
    this.killCount++;
    const gold = enemy.reward ?? 0;
    this.game.gold += gold;
    onDamage?.(enemy.x, enemy.y, `+${gold}`, 'gold');
    this.game.onGoldChange?.();
  }

  _checkCastle({ onCastleHit }) {
    const castle = this._getCastleBounds();
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.emerging) continue;
      if (enemy.pairedSoldier) continue;
      if (enemy.x - enemy.radius <= castle.right + 6) {
        enemy.dead = true;
        enemy.fade = 0;
        onCastleHit?.(CONFIG.castle.collisionDamage);
      }
    }
  }

  _spawnAttackFx(attacker, target, side) {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const len = Math.hypot(dx, dy) || 1;
    const dur = CONFIG.vfx.attackSlashMs ?? 160;
    this.combatEffects.push({
      type: 'slash',
      x: attacker.x + (dx / len) * attacker.radius * 0.5,
      y: attacker.y + (dy / len) * attacker.radius * 0.5,
      angle: Math.atan2(dy, dx),
      len: Math.min(len * 0.85, 90),
      side,
      t: 0,
      duration: dur,
    });
    this.combatEffects.push({
      type: 'impact',
      x: target.x,
      y: target.y,
      side,
      t: 0,
      duration: CONFIG.vfx.attackImpactMs ?? 240,
    });
    attacker.attackPulse = CONFIG.vfx.attackPulseMs ?? 110;
    target.hitFlash = CONFIG.vfx.damageFlashMs ?? 100;
    if (side === 'enemy') vibrate(28);
    else vibrate(14);
  }

  _tickCombatFx(dt) {
    for (const fx of this.combatEffects) fx.t += dt;
    this.combatEffects = this.combatEffects.filter((fx) => fx.t < fx.duration);
  }

  _drawCombatFx(ctx) {
    for (const fx of this.combatEffects) {
      const p = fx.t / fx.duration;
      const fade = 1 - p;
      ctx.save();
      if (fx.type === 'slash') {
        const isEnemy = fx.side === 'enemy';
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.angle);
        const w = fx.len * (0.4 + (1 - p) * 0.6);
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(
          0.35,
          isEnemy ? `rgba(255,80,60,${0.9 * fade})` : `rgba(255,230,120,${0.95 * fade})`
        );
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 6 + (1 - p) * 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(w, 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 3);
        ctx.lineTo(w * 0.75, -2);
        ctx.stroke();
      } else if (fx.type === 'impact') {
        const isEnemy = fx.side === 'enemy';
        const r = 12 + p * 28;
        ctx.strokeStyle = isEnemy
          ? `rgba(255,60,40,${0.85 * fade})`
          : `rgba(255,220,80,${0.9 * fade})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = isEnemy ? `rgba(255,100,80,${0.35 * fade})` : `rgba(255,255,200,${0.4 * fade})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _tickPortalBursts(dt) {
    for (const b of this.portalBursts) b.t += dt;
    this.portalBursts = this.portalBursts.filter((b) => b.t < b.duration);
  }

  aliveEnemyCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  drawBackground(ctx) {
    const L = this.lane;
    ctx.save();
    const g = ctx.createLinearGradient(0, L.yTop, 0, L.yBottom);
    g.addColorStop(0, '#5c3d2e');
    g.addColorStop(0.5, '#6b4423');
    g.addColorStop(1, '#4a3020');
    ctx.fillStyle = g;
    ctx.fillRect(L.xLeft - 8, L.yTop, L.xRight - L.xLeft + 16, L.yBottom - L.yTop);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(L.xLeft, L.yTop, L.xRight - L.xLeft, L.yBottom - L.yTop);

    ctx.fillStyle = 'rgba(255,80,80,0.08)';
    ctx.fillRect(L.enemySpawnX - 45, L.portalYMin, 50, L.portalYMax - L.portalYMin);

    this._drawCastle(ctx);
    this._drawPortalZone(ctx);
    ctx.restore();
  }

  drawUnits(ctx) {
    ctx.save();
    this._drawCombatFx(ctx);
    for (const e of this.enemies) {
      if (e.emerging) e.draw(ctx);
    }
    for (const s of this.soldiers) {
      if (!s.dead) s.drawCombatOverlay(ctx);
    }
    for (const e of this.enemies) {
      if (!e.emerging) e.draw(ctx);
    }
    ctx.restore();
  }

  draw(ctx) {
    this.drawBackground(ctx);
    this.drawUnits(ctx);
  }

  _drawCastle(ctx) {
    const { left, top, width: w, height: h } = this._getCastleBounds();
    const hpRatio = this.game.castleHp / CONFIG.castle.maxHp;
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(left, top, w, h);
    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.moveTo(left - 4, top);
    ctx.lineTo(left + w / 2, top - 18);
    ctx.lineTo(left + w + 4, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(left, top + h - 8, w * hpRatio, 6);
  }

  _drawPortalZone(ctx) {
    const L = this.lane;
    const cx = L.enemySpawnX;
    const midY = (L.portalYMin + L.portalYMax) / 2;
    const halfH = (L.portalYMax - L.portalYMin) / 2;
    const t = performance.now() / 1000;
    const pulse = 1 + Math.sin(t * 3) * 0.06;

    ctx.strokeStyle = 'rgba(255,68,68,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 28, L.portalYMin, 44, L.portalYMax - L.portalYMin);

    for (const burst of this.portalBursts) {
      const p = burst.t / burst.duration;
      ctx.strokeStyle = `rgba(255,180,50,${(1 - p) * 0.8})`;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, 20 + p * 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    const R = L.portalRadius ?? 28;
    const grad = ctx.createRadialGradient(cx, midY, 2, cx, midY, R * pulse);
    grad.addColorStop(0, 'rgba(255,80,80,0.5)');
    grad.addColorStop(1, 'rgba(80,0,40,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, midY, R * 0.6 * pulse, halfH * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffaaaa';
    ctx.font = 'bold 11px Poppins,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('传送门', cx, L.portalYMax + 14);
  }

  clear() {
    this.soldiers = [];
    this.enemies = [];
    this.killCount = 0;
    this.portalBursts = [];
    this.combatEffects = [];
  }
}
