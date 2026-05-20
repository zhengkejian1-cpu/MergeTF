import { CONFIG } from './config.js';
import { createDebugState, getDebugHudLines } from './debug.js';
import { DropQueue } from './dropQueue.js';
import { DefenseLane } from './defenseLane.js';
import { PhysicsWorld } from './physics.js';
import { SynthesisManager } from './synthesis.js';
import { getSoldierConfig } from './soldier.js';
import { UIManager } from './uiManager.js';
import { clampDropX } from './mergeUtils.js';
import { FloatTextManager, getCanvasPoint, scaleGameContainer, vibrate } from './utils.js';
import { WaveManager } from './waveManager.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.floatText = new FloatTextManager(document.getElementById('floatTextLayer'));

    this.gold = CONFIG.economy.startingGold;
    this.castleHp = CONFIG.castle.initialHp;
    this.paused = false;
    this.over = false;
    this.lastTime = 0;
    this.dragGhost = null;
    this.dropQueue = new DropQueue();
    this.debug = createDebugState();

    this.physics = new PhysicsWorld();
    this.defenseLane = new DefenseLane(this);
    this.synthesis = new SynthesisManager(this.physics);

    this.waveManager = new WaveManager(
      this.defenseLane,
      {
        onWaveStart: (wave, isBoss) => {
          this.ui.update();
          if (isBoss) this.ui.showBossBanner();
        },
        onTimerUpdate: (sec) => this.ui.setWaveTimer(sec),
      },
      this
    );

    this.ui = new UIManager(this);
    this._bindSynthesisInput();
    this.restart();
    scaleGameContainer();
    window.addEventListener('resize', scaleGameContainer);
    requestAnimationFrame((t) => this.loop(t));
  }

  restart() {
    this.gold = CONFIG.economy.startingGold;
    this.castleHp = CONFIG.castle.initialHp;
    this.paused = false;
    this.over = false;
    this.dropQueue.reset();
    this.physics.clear();
    this.defenseLane.clear();
    this.waveManager.reset();
    this.ui.update();
    this.ui.updateDropQueue();
  }

  revive() {
    this.castleHp = Math.max(1, Math.floor(CONFIG.castle.maxHp * 0.5));
    this.over = false;
    this.paused = false;
    this.ui.update();
  }

  pause() {
    if (this.over) return;
    this.paused = true;
    this.ui.showPause();
  }

  resume() {
    this.paused = false;
  }

  onGoldChange() {
    this.ui.update();
  }

  spendGold(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    this.onGoldChange();
    return true;
  }

  addGold(amount) {
    this.gold += amount;
    this.onGoldChange();
  }

  setDebugEnabled(on) {
    this.debug.enabled = on;
  }

  setDebugField(key, value) {
    if (!(key in this.debug)) return;
    this.debug[key] = value;
  }

  debugForceNextWave() {
    if (!this.debug.enabled) return;
    this.waveManager.forceNextWave();
  }

  debugInjectEnemies(n = 5) {
    if (!this.debug.enabled) return;
    this.waveManager.injectEnemies(n);
  }

  swapDropQueue() {
    this.dropQueue.swap();
    this.ui.updateDropQueue();
    vibrate(12);
  }

  damageCastle(amount) {
    this.castleHp -= amount;
    this.ui.onCastleHit();
    this.ui.update();
    if (this.castleHp <= 0) {
      this.castleHp = 0;
      this.over = true;
      this.ui.showGameOver();
    }
  }

  _bindSynthesisInput() {
    const touch = document.getElementById('synthesisTouch');
    if (!touch) return;

    let dragging = false;

    const dropTop = CONFIG.layout.synthesisTop;
    const dropBottom = CONFIG.layout.playfieldBottom ?? CONFIG.defenseLane.yBottom;
    /** 整场可左右瞄准；球始终在 dropLineY 垂直落下 */
    const inDropZone = (p) =>
      p.x >= CONFIG.synthesis.leftWall &&
      p.x <= CONFIG.synthesis.rightWall &&
      p.y >= dropTop &&
      p.y <= dropBottom;

    touch.addEventListener('pointerdown', (e) => {
      if (this.paused || this.over) return;
      const p = getCanvasPoint(this.canvas, e.clientX, e.clientY);
      if (!inDropZone(p)) return;
      if (this.gold < CONFIG.economy.dragSpawnCost) {
        this.ui.showInsufficientGold();
        return;
      }
      touch.setPointerCapture(e.pointerId);
      dragging = true;
      const level = this.dropQueue.peek();
      const cfg = getSoldierConfig(level);
      this.dragGhost = { x: clampDropX(p.x, cfg.radius), level };
    });

    touch.addEventListener('pointermove', (e) => {
      if (!dragging || !this.dragGhost) return;
      const p = getCanvasPoint(this.canvas, e.clientX, e.clientY);
      const cfg = getSoldierConfig(this.dragGhost.level);
      this.dragGhost.x = clampDropX(p.x, cfg.radius);
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      const ghost = this.dragGhost;
      this.dragGhost = null;
      if (!ghost) return;
      if (!this.spendGold(CONFIG.economy.dragSpawnCost)) {
        this.ui.showInsufficientGold();
        return;
      }
      const spawnLevel = this.dropQueue.consume();
      this.ui.updateDropQueue();
      this.synthesis.spawnDrop(ghost.x, spawnLevel);
      vibrate(18);
    };

    touch.addEventListener('pointerup', endDrag);
    touch.addEventListener('pointercancel', endDrag);
  }

  loop(timestamp) {
    const dt = Math.min(50, timestamp - this.lastTime || 16);
    this.lastTime = timestamp;

    if (!this.paused && !this.over) {
      this.physics.update(dt, (a, b) => this.synthesis.tryMergeOnContact(a, b));
      this.synthesis.checkOverflow();
      this.defenseLane.update(dt, {
        onDamage: (x, y, text, cls) => this.floatText.spawn(x, y, text, cls),
        onCastleHit: (dmg) => this.damageCastle(dmg),
      });
      this.waveManager.update(dt);
    }

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    const { width } = CONFIG.canvas;
    ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    const playBottom = CONFIG.layout.playfieldBottom ?? CONFIG.defenseLane.yBottom;
    const playTop = CONFIG.layout.synthesisTop;
    const splitY = CONFIG.defenseLane.yTop;
    const grad = ctx.createLinearGradient(0, playTop, 0, playBottom);
    grad.addColorStop(0, '#1a472a');
    grad.addColorStop((splitY - playTop) / (playBottom - playTop), '#2d6a4f');
    grad.addColorStop(1, '#3d5c3a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, playTop, width, playBottom - playTop);

    this.defenseLane.drawBackground(ctx);
    this.synthesis.drawBounds(ctx);
    if (this.dragGhost) {
      this.synthesis.drawDropGuide(ctx, this.dragGhost.x, this.dragGhost.level);
    }
    this.synthesis.drawFruits(ctx);
    this.defenseLane.drawUnits(ctx);

    if (this.debug.enabled) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,220,80,0.92)';
      ctx.font = 'bold 10px Poppins,sans-serif';
      ctx.textAlign = 'left';
      getDebugHudLines(this).forEach((line, i) => {
        ctx.fillText(`DEBUG ${line}`, 10, CONFIG.layout.synthesisTop + 16 + i * 14);
      });
      ctx.restore();
    }

  }
}

new Game();
