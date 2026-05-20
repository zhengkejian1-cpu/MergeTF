import { CONFIG, MAX_SOLDIER_LEVEL, interactionDist } from './config.js';
import { dist, uid } from './utils.js';

export function getSoldierConfig(level) {
  return CONFIG.soldiers[level] || CONFIG.soldiers[1];
}

export function createFruitMeta(level) {
  const cfg = getSoldierConfig(level);
  return {
    id: uid('fruit'),
    level,
    cfg,
    merging: false,
    hp: cfg.hp,
    maxHp: cfg.hp,
    attack: cfg.attack,
    attackTimer: 0,
    pairedEnemy: null,
    hitFlash: 0,
    attackPulse: 0,
    dead: false,
    fade: 1,
  };
}

/** 战斗数据视图，位置由 Matter 球体驱动 */
export class LaneSoldier {
  constructor(level, x, y) {
    const cfg = getSoldierConfig(level);
    this.id = uid('soldier');
    this.fruitBodyId = null;
    this.level = level;
    this.cfg = cfg;
    this.x = x;
    this.y = y;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.attack = cfg.attack;
    this.attackTimer = 0;
    this.dead = false;
    this.fade = 1;
    this.merging = false;
    this.pairedEnemy = null;
    this.moveSpeed = (cfg.speed || 1) * (CONFIG.defenseLane.soldierChaseSpeed ?? 72);
    this.hitFlash = 0;
    this.attackPulse = 0;
  }

  static fromFruit(body, meta) {
    const s = new LaneSoldier(meta.level, body.position.x, body.position.y);
    s.fruitBodyId = body.id;
    s.id = meta.id || s.id;
    s.hp = meta.hp ?? s.hp;
    s.maxHp = meta.maxHp ?? s.maxHp;
    s.attack = meta.attack ?? s.attack;
    s.attackTimer = meta.attackTimer ?? 0;
    s.pairedEnemy = meta.pairedEnemy ?? null;
    s.hitFlash = meta.hitFlash ?? 0;
    s.attackPulse = meta.attackPulse ?? 0;
    s.dead = meta.dead ?? false;
    s.fade = meta.fade ?? 1;
    s.merging = meta.merging ?? false;
    return s;
  }

  syncFromFruit(body, meta) {
    this.fruitBodyId = body.id;
    this.level = meta.level;
    this.cfg = meta.cfg;
    this.x = body.position.x;
    this.y = body.position.y;
    this.hp = meta.hp;
    this.maxHp = meta.maxHp;
    this.attack = meta.attack;
    this.attackTimer = meta.attackTimer ?? 0;
    this.pairedEnemy = meta.pairedEnemy ?? null;
    this.hitFlash = meta.hitFlash ?? 0;
    this.attackPulse = meta.attackPulse ?? 0;
    this.dead = meta.dead ?? false;
    this.fade = meta.fade ?? 1;
    this.merging = meta.merging ?? false;
  }

  syncToMeta(meta) {
    meta.level = this.level;
    meta.cfg = this.cfg;
    meta.hp = this.hp;
    meta.maxHp = this.maxHp;
    meta.attack = this.attack;
    meta.attackTimer = this.attackTimer;
    meta.pairedEnemy = this.pairedEnemy;
    meta.hitFlash = this.hitFlash;
    meta.attackPulse = this.attackPulse;
    meta.dead = this.dead;
    meta.fade = this.fade;
    meta.merging = this.merging;
  }

  get radius() {
    return this.cfg.radius;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = CONFIG.vfx.damageFlashMs ?? 100;
    if (this.hp <= 0) {
      this.dead = true;
      this.fade = 0;
      this.pairedEnemy = null;
    }
    return this.hp <= 0;
  }

  update(dt) {
    if (this.dead) {
      this.fade -= dt / (CONFIG.vfx.deathFadeMs / 1000);
      return this.fade <= 0;
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.attackPulse > 0) this.attackPulse = Math.max(0, this.attackPulse - dt);
    return false;
  }

  distTo(unit) {
    return dist(this.x, this.y, unit.x, unit.y);
  }

  inSenseRange(enemy) {
    return this.distTo(enemy) <= interactionDist(this.radius, enemy.radius);
  }

  canDuelAttack(enemy) {
    if (!enemy || enemy.dead || this.dead) return false;
    return this.distTo(enemy) <= interactionDist(this.radius, enemy.radius);
  }

  getDamage() {
    return this.attack;
  }

  drawCombatOverlay(ctx) {
    if (this.fade <= 0 || this.dead) return;
    const r = this.radius;

    if (this.pairedEnemy && !this.dead) {
      ctx.strokeStyle = 'rgba(255,180,80,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.pairedEnemy.x, this.pairedEnemy.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const barW = r * 2;
    const ratio = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x - barW / 2, this.y - r - 10, barW, 5);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(this.x - barW / 2, this.y - r - 10, barW * ratio, 5);
  }
}

export { MAX_SOLDIER_LEVEL };
