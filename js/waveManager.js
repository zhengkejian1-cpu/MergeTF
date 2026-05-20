import { CONFIG } from './config.js';
import {
  getSpawnInterval,
  getWaveEnemyCount,
  getWaveHpMultiplier,
  getWaveScheduleDelay,
} from './debug.js';

const NORMAL_TYPES = ['goblin', 'wolf', 'orc'];

export class WaveManager {
  constructor(defenseLane, callbacks, game = null) {
    this.lane = defenseLane;
    this.game = game;
    this.callbacks = callbacks;
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.state = 'waiting';
    this.nextWaveIn = CONFIG.waves.clearDelay;
  }

  reset() {
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.state = 'waiting';
    this._scheduleNextWave(CONFIG.waves.firstWaveDelay ?? 6);
  }

  update(dt) {
    if (this.state === 'waiting') {
      this.nextWaveIn -= dt / 1000;
      this.callbacks.onTimerUpdate?.(Math.max(0, this.nextWaveIn));
      if (this.nextWaveIn <= 0) this.startWave();
      return;
    }

    if (this.state === 'spawning') {
      this.spawnTimer -= dt / 1000;
      if (this.spawnTimer <= 0 && this.spawnQueue.length) {
        if (this.lane.canSpawnEnemy()) {
          const item = this.spawnQueue.shift();
          const mult = this._hpMultiplier(item);
          this.lane.addEnemy(item.type, mult);
          this.spawnTimer = getSpawnInterval(this.game);
        } else {
          this.spawnTimer = 0.2;
        }
      }
      if (!this.spawnQueue.length && this.spawnTimer <= 0) this.state = 'active';
    }

    if (this.state === 'active' || this.state === 'spawning') {
      this.waveTimer += dt / 1000;
      const alive = this.lane.aliveEnemyCount();
      const timeout = this.waveTimer >= CONFIG.waves.waveTimeout;
      if (alive === 0 && this.spawnQueue.length === 0) {
        this._scheduleNextWave(CONFIG.waves.clearDelay);
      } else if (timeout && alive === 0) {
        this._scheduleNextWave(CONFIG.waves.clearDelay);
      }
    }
  }

  _hpMultiplier(item) {
    return getWaveHpMultiplier(this.game, item, this.wave);
  }

  _pickEnemyType() {
    const tiers = CONFIG.waves.typeWeightsByWave;
    let weights = tiers?.[tiers.length - 1]?.weights ?? { goblin: 0.5, wolf: 0.3, orc: 0.2 };
    for (const tier of tiers || []) {
      if (this.wave <= tier.maxWave) {
        weights = tier.weights;
        break;
      }
    }
    const r = Math.random();
    let acc = 0;
    for (const type of NORMAL_TYPES) {
      acc += weights[type] ?? 0;
      if (r < acc) return type;
    }
    return 'goblin';
  }

  _scheduleNextWave(delay) {
    this.state = 'waiting';
    this.nextWaveIn = getWaveScheduleDelay(this.game, delay);
    this.waveTimer = 0;
    this.callbacks.onTimerUpdate?.(delay);
  }

  startWave() {
    this.wave++;
    this.state = 'spawning';
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.spawnQueue = [];

    const isBoss = this.wave % CONFIG.waves.bossEveryWave === 0;
    this.callbacks.onWaveStart?.(this.wave, isBoss);

    if (isBoss) {
      this.spawnQueue.push({ type: 'boss', boss: true });
      let adds = CONFIG.waves.bossAdds ?? 2;
      adds = getWaveEnemyCount(this.game, adds);
      for (let i = 0; i < adds; i++) {
        this.spawnQueue.push({ type: this._pickEnemyType(), boss: false });
      }
      return;
    }

    const step = CONFIG.waves.increaseEveryNWaves ?? 2;
    const waveSteps = Math.floor((this.wave - 1) / step);
    let count = CONFIG.waves.baseEnemies + waveSteps * CONFIG.waves.increasePerWave;
    count = Math.min(count, CONFIG.waves.maxEnemiesPerWave ?? 10);
    count = getWaveEnemyCount(this.game, count);

    for (let i = 0; i < count; i++) {
      this.spawnQueue.push({ type: this._pickEnemyType(), boss: false });
    }
  }

  get currentWave() {
    return this.wave;
  }

  /** 调试：立刻开始下一波或加速当前波出怪 */
  forceNextWave() {
    if (this.state === 'waiting') {
      this.nextWaveIn = 0;
      return;
    }
    if (this.state === 'spawning' || this.state === 'active') {
      this.spawnTimer = 0;
    }
  }

  /** 调试：立刻塞入若干只怪到当前出怪队列 */
  injectEnemies(count = 3) {
    const types = ['goblin', 'wolf', 'orc'];
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawnQueue.push({ type, boss: false });
    }
    if (this.state === 'waiting') {
      this.nextWaveIn = 0;
    } else {
      this.spawnTimer = 0;
      if (this.state === 'active') this.state = 'spawning';
    }
  }
}
