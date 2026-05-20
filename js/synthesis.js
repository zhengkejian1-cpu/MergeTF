import { CONFIG, MAX_SOLDIER_LEVEL } from './config.js';
import { drawInteractionRing } from './drawUtils.js';
import {
  clampDropX,
  isMergeImmune,
  pairCenterDist,
  pairShouldTryMerge,
  stampMergeImmunity,
} from './mergeUtils.js';
import { createFruitBody, popMergedFruit } from './physics.js';
import { createFruitMeta, getSoldierConfig } from './soldier.js';
import { vibrate } from './utils.js';

const MatterRef = globalThis.Matter;
const { World, Body } = MatterRef;

/** 全场球体：投放、合成、碰撞规则一致，仅顶部可点击投放 */
export class SynthesisManager {
  constructor(physics, onMergeVfx) {
    this.physics = physics;
    this.onMergeVfx = onMergeVfx;
    this.mergeEffects = [];
    this._merging = new Set();
  }

  get dropLineY() {
    return CONFIG.synthesis.dropLineY ?? 168;
  }

  canSpawn() {
    return this.physics.fruitCount() < CONFIG.synthesis.maxSoldiers;
  }

  spawnDrop(x, level = 1) {
    if (!this.canSpawn()) this._removeOldestFruit();
    const cfg = getSoldierConfig(level);
    const meta = createFruitMeta(level);
    const px = clampDropX(x, cfg.radius);
    const body = createFruitBody(px, this.dropLineY, level, cfg, 'drop');
    body.plugin = meta;
    this.physics.addFruit(body, meta);
    this.physics.wakeAllFruits();
    return body;
  }

  _spawnMerged(cx, cy, level) {
    if (!this.canSpawn()) this._removeOldestFruit();
    const cfg = getSoldierConfig(level);
    const meta = createFruitMeta(level);
    stampMergeImmunity(meta);
    const body = createFruitBody(cx, cy, level, cfg, 'merge');
    body.plugin = meta;
    this.physics.addFruit(body, meta);
    popMergedFruit(body);
    this.physics.wakeAllFruits();
    return body;
  }

  _removeOldestFruit() {
    const bodies = this.physics.getFruitBodies();
    if (!bodies.length) return;
    const oldest = bodies.reduce((a, b) => (a.id < b.id ? a : b));
    this.physics.removeFruit(oldest);
    World.remove(this.physics.world, oldest);
  }

  _removeFruit(body) {
    this.physics.removeFruit(body);
    World.remove(this.physics.world, body);
  }

  _pairKey(idA, idB) {
    return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
  }

  _lockPair(key) {
    this._merging.add(key);
    const ms = CONFIG.synthesis.mergePairLockMs ?? 80;
    setTimeout(() => this._merging.delete(key), ms);
  }

  tryMergeOnContact(bodyA, bodyB) {
    const metaA = this.physics.getMeta(bodyA) || bodyA.plugin;
    const metaB = this.physics.getMeta(bodyB) || bodyB.plugin;
    if (!metaA || !metaB || metaA.merging || metaB.merging || metaA.dead || metaB.dead) {
      return false;
    }

    const { dist, rA, rB } = pairCenterDist(bodyA, bodyB, metaA, metaB);
    if (!pairShouldTryMerge(rA, rB, dist, metaA.level, metaB.level, MAX_SOLDIER_LEVEL)) {
      return false;
    }
    if (isMergeImmune(metaA) || isMergeImmune(metaB)) return false;

    const touch = rA + rB;
    if (dist > touch + 1.5) {
      const maxRel = CONFIG.synthesis.mergeMaxRelSpeed ?? 11;
      const rvx = bodyB.velocity.x - bodyA.velocity.x;
      const rvy = bodyB.velocity.y - bodyA.velocity.y;
      if (Math.hypot(rvx, rvy) > maxRel) return false;
    }

    const key = this._pairKey(bodyA.id, bodyB.id);
    if (this._merging.has(key)) return false;

    this._executeMerge(bodyA, bodyB, metaA, metaB, key);
    return true;
  }

  _executeMerge(bodyA, bodyB, metaA, metaB, key) {
    this._lockPair(key);
    metaA.merging = true;
    metaB.merging = true;

    const cx = (bodyA.position.x + bodyB.position.x) / 2;
    const cy = (bodyA.position.y + bodyB.position.y) / 2;
    const newLevel = metaA.level + 1;

    this._removeFruit(bodyA);
    this._removeFruit(bodyB);

    this.onMergeVfx?.({ x: cx, y: cy, level: newLevel });
    vibrate(32);
    this._pushMergeJuice(cx, cy, newLevel);
    this._spawnMerged(cx, cy, newLevel);
  }

  _pushMergeJuice(x, y, level) {
    const r = getSoldierConfig(level).radius;
    this.mergeEffects.push({
      type: 'ring',
      x,
      y,
      level,
      maxR: r * 2.2,
      t: 0,
      duration: CONFIG.vfx.mergeDuration ?? 180,
    });
    this.mergeEffects.push({
      type: 'flash',
      x,
      y,
      t: 0,
      duration: 120,
    });
  }

  checkOverflow() {
    const { leftWall, rightWall } = CONFIG.synthesis;
    for (const body of this.physics.getFruitBodies()) {
      const meta = this.physics.getMeta(body) || body.plugin;
      if (!meta || meta.merging) continue;
      const r = meta.cfg.radius;
      let x = body.position.x;
      if (x - r < leftWall) x = leftWall + r;
      if (x + r > rightWall) x = rightWall - r;
      if (x !== body.position.x) {
        Body.setPosition(body, { x, y: body.position.y });
        Body.setVelocity(body, { x: body.velocity.x * 0.5, y: body.velocity.y });
      }
    }
  }

  drawDropGuide(ctx, aimX, level) {
    const { leftWall, rightWall } = CONFIG.synthesis;
    const y = this.dropLineY;
    const cfg = getSoldierConfig(level);
    const r = cfg.radius;
    const x = clampDropX(aimX, r);

    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, CONFIG.defenseLane.yBottom - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255,160,60,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    const top = CONFIG.layout.synthesisTop;
    ctx.strokeRect(leftWall, top, rightWall - leftWall, CONFIG.defenseLane.yBottom - top);
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftWall, y);
    ctx.lineTo(rightWall, y);
    ctx.stroke();

    drawInteractionRing(ctx, x, y, r, 0.35);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = cfg.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Poppins,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), x, y);
    ctx.restore();
  }

  drawFruits(ctx) {
    const bodies = this.physics.getFruitBodies();
    for (const body of bodies) {
      const meta = this.physics.getMeta(body) || body.plugin;
      if (!meta || meta.merging) continue;
      const { x, y } = body.position;
      const angle = body.angle || 0;
      const r = meta.cfg.radius;
      ctx.save();
      drawInteractionRing(ctx, x, y, r, 0.3);
      if (meta.hitFlash > 0) {
        const a = meta.hitFlash / (CONFIG.vfx.damageFlashMs ?? 100);
        ctx.fillStyle = `rgba(255,255,255,${0.5 * a})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.translate(-x, -y);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.2, r, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
      grad.addColorStop(0, meta.cfg.color);
      grad.addColorStop(1, meta.cfg.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(r * 0.72)}px Poppins,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(meta.level), x, y);
      ctx.restore();
    }

    this._drawMergeJuice(ctx);
  }

  _drawMergeJuice(ctx) {
    for (const fx of this.mergeEffects) {
      fx.t += 16;
      const p = fx.t / fx.duration;
      const fade = 1 - p;
      ctx.save();
      if (fx.type === 'ring') {
        const r = fx.maxR * (0.35 + p * 0.85);
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * fade})`;
        ctx.lineWidth = 4 * fade;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,220,${0.35 * fade})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.type === 'flash') {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * fade})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 18 + p * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    this.mergeEffects = this.mergeEffects.filter((fx) => fx.t < fx.duration);
  }

  drawBounds(ctx) {
    const { leftWall, rightWall } = CONFIG.synthesis;
    const yStart = CONFIG.layout.synthesisTop;
    const yEnd = CONFIG.defenseLane.yBottom;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeRect(leftWall, yStart, rightWall - leftWall, yEnd - yStart);
    ctx.restore();
  }
}
