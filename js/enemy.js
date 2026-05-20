import { CONFIG, interactionDist } from './config.js';
import { drawInteractionRing } from './drawUtils.js';
import { uid } from './utils.js';

export function getEnemyConfig(type) {
  return CONFIG.enemies[type] || CONFIG.enemies.goblin;
}

export class LaneEnemy {
  constructor(type, x, y, waveMult = 1, debugMults = {}) {
    const cfg = getEnemyConfig(type);
    const hpMult = waveMult * (debugMults.hpMult ?? 1);
    const atkMult = debugMults.atkMult ?? 1;
    const rewardMult = debugMults.rewardMult ?? 1;
    this.id = uid('enemy');
    this.type = type;
    this.cfg = cfg;
    this.portalX = x;
    this.portalY = y;
    this.x = x;
    this.y = y;
    this.maxHp = cfg.hp * hpMult;
    this.hp = this.maxHp;
    this.attack = cfg.attack * atkMult * (CONFIG.combat.enemyAttackMult ?? 5);
    this.hitFlash = 0;
    this.attackPulse = 0;
    this.reward = Math.round((cfg.reward || 0) * rewardMult);
    this.speedMult = debugMults.speedMult ?? 1;
    this.isBoss = !!cfg.isBoss;
    this.attackTimer = 0;
    this.dead = false;
    this.fade = 1;
    this.emerging = true;
    this.emergeTime = 0;
    this.emergeDuration = CONFIG.defenseLane.enemyEmergeMs ?? 500;
    this.pairedSoldier = null;
    this.duelMode = 'march';
  }

  get radius() {
    return this.cfg.radius * (CONFIG.lane?.enemyRadiusScale ?? 0.78);
  }

  distToSoldier(s) {
    const dx = s.x - this.x;
    const dy = s.y - this.y;
    return Math.hypot(dx, dy);
  }

  inSenseOf(s) {
    return this.distToSoldier(s) <= interactionDist(this.radius, s.radius);
  }

  get emergeProgress() {
    return Math.min(1, this.emergeTime / this.emergeDuration);
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = CONFIG.vfx.damageFlashMs ?? 100;
    if (this.hp <= 0) {
      this.dead = true;
      this.fade = 1;
    }
    return this.hp <= 0;
  }

  update(dt) {
    if (this.dead) {
      this.fade -= dt / (CONFIG.vfx.deathFadeMs / 1000);
      return this.fade <= 0;
    }

    if (this.emerging) {
      this.emergeTime += dt;
      this.x = this.portalX;
      this.y = this.portalY;
      if (this.emergeTime >= this.emergeDuration) this.emerging = false;
      return false;
    }

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.attackPulse > 0) this.attackPulse = Math.max(0, this.attackPulse - dt);
    return false;
  }

  draw(ctx) {
    if (this.fade <= 0) return;
    const emerge = this.emerging ? this.emergeProgress : 1;
    const scale = 0.35 + emerge * 0.65;
    const pulse = this.attackPulse > 0 ? 1 + (this.attackPulse / (CONFIG.vfx.attackPulseMs ?? 110)) * 0.12 : 1;
    const drawR = this.radius * scale * pulse;

    ctx.save();
    ctx.globalAlpha = (this.dead ? Math.max(0, this.fade) : 1) * (0.5 + emerge * 0.5);

    if (!this.dead) drawInteractionRing(ctx, this.x, this.y, drawR, 0.28);

    if (this.emerging) {
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 16 * emerge;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 4, drawR, drawR * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.cfg.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, drawR, 0, Math.PI * 2);
    ctx.fill();

    if (this.hitFlash > 0) {
      const a = this.hitFlash / (CONFIG.vfx.damageFlashMs ?? 100);
      ctx.fillStyle = `rgba(255,120,120,${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, drawR * 1.08, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffcccc';
    ctx.font = `bold ${Math.round(12 * scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.isBoss ? '👹' : '💀', this.x, this.y);

    if (!this.emerging) {
      const barW = drawR * 2.2;
      const ratio = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.x - barW / 2, this.y - drawR - 10, barW, 5);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(this.x - barW / 2, this.y - drawR - 10, barW * ratio, 5);
    }
    ctx.restore();
  }
}
