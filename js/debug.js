import { CONFIG } from './config.js';

/** 调试面板默认项（开启调试后可即时改数值） */
export const DEBUG_DEFAULTS = {
  enabled: false,
  spawnRate: 3,
  enemyHpMult: 1,
  enemyAtkMult: 1,
  enemySpeedMult: 1,
  waveCountMult: 1,
  waveHpMult: 1,
  waveDelayMult: 0.35,
  maxActiveMult: 2,
  rewardMult: 1,
};

export function createDebugState() {
  return { ...DEBUG_DEFAULTS };
}

export function isDebug(game) {
  return !!game?.debug?.enabled;
}

export function getSpawnInterval(game) {
  const base = CONFIG.waves.spawnInterval;
  if (!isDebug(game)) return base;
  const rate = Math.max(0.5, game.debug.spawnRate || 1);
  return Math.max(0.1, base / rate);
}

export function getMaxActiveEnemies(game) {
  const base = CONFIG.waves.maxActiveEnemies;
  if (!isDebug(game)) return base;
  return Math.ceil(base * Math.max(1, game.debug.maxActiveMult || 1));
}

/** 波次成长/Boss 系数（不含「敌人生血」滑条，那个在生成单位时叠） */
export function getWaveHpMultiplier(game, item, wave) {
  let m = 1;
  if (item.boss) m = CONFIG.waves.bossHpMult ?? 1.55;
  else m = 1 + (wave - 1) * (CONFIG.waves.waveHpScale ?? 0.038);
  if (isDebug(game)) m *= Math.max(0.05, game.debug.waveHpMult ?? 1);
  return m;
}

export function getEnemyDebugMults(game) {
  if (!isDebug(game)) return {};
  return {
    hpMult: game.debug.enemyHpMult || 1,
    atkMult: game.debug.enemyAtkMult || 1,
    speedMult: game.debug.enemySpeedMult || 1,
    rewardMult: game.debug.rewardMult || 1,
  };
}

export function getWaveEnemyCount(game, baseCount) {
  if (!isDebug(game)) return baseCount;
  return Math.max(1, Math.ceil(baseCount * (game.debug.waveCountMult || 1)));
}

export function getWaveScheduleDelay(game, baseDelay) {
  if (!isDebug(game)) return baseDelay;
  return Math.max(0.3, baseDelay * (game.debug.waveDelayMult ?? 1));
}

export function getEnemySpeedMult(game) {
  return isDebug(game) ? game.debug.enemySpeedMult || 1 : 1;
}

export function getDebugHudLines(game) {
  if (!isDebug(game)) return [];
  const d = game.debug;
  return [
    `出怪×${d.spawnRate.toFixed(1)} · ${getSpawnInterval(game).toFixed(2)}s/只`,
    `HP×${d.enemyHpMult.toFixed(2)} ATK×${d.enemyAtkMult.toFixed(2)} SPD×${d.enemySpeedMult.toFixed(2)}`,
    `波量×${d.waveCountMult.toFixed(2)} 成长×${d.waveHpMult.toFixed(2)} 等波×${d.waveDelayMult.toFixed(2)}`,
  ];
}
