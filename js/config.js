/**
 * 数值总纲（合成塔防常见节奏）
 * ─────────────────────────────────────────
 * 1. 经济：开局约 8 次投放，击杀回本；中期靠合成升阶而非数量碾压
 * 2. 士兵：每升 1 级约 +70%~90% 有效战力；2 级弓手脆皮高伤，6 级为波 10+ 核心
 * 3. 敌人：前期哥布林为主，中期魔狼，后期兽人；Boss 波需 3~4 个 3 级以上单位
 * 4. 波次：前 10 秒备战 → 每波 2~8 只 → 间隔 12 秒整备；约 18~25 波城堡告急
 * 5. 城堡：120 血；全场 Matter 球堆叠合成，敌人寻敌 1v1 或攻城堡
 */

export const CONFIG = {
  canvas: {
    width: 540,
    height: 960,
  },

  layout: {
    synthesisTop: 128,
    playfieldBottom: 800,
  },

  /**
   * gap — 唯一感应/碰撞/攻击范围（表面间隙，像素）
   * 用于：球体互挤、同级合成、对战寻敌、攻击判定、外圈绘制
   */
  interaction: {
    gap: 44,
  },

  lane: {
    enemyRadiusScale: 0.78,
  },

  synthesis: {
    /** 投放瞄准线（大西瓜式：只左右移动，松手垂直落下） */
    dropLineY: 168,
    leftWall: 50,
    rightWall: 490,
    maxSoldiers: 15,
    gravity: 2.15,
    fruitRestitution: 0.32,
    groundRestitution: 0.02,
    wallRestitution: 0.1,
    friction: 0.048,
    frictionStatic: 0.035,
    frictionAir: 0.011,
    wallFriction: 0.06,
    groundFriction: 0.28,
    fruitCollisionSpring: 0.45,
    fruitCollisionSqueeze: 0.68,
    fruitCollisionIterations: 8,
    fruitCollisionVelMul: 0.14,
    mergePairLockMs: 80,
    mergeSpawnImmunityMs: 70,
    /** 未贴紧时相对速度过大则暂不合成（贴紧后允许撞击合成） */
    mergeMaxRelSpeed: 11,
    mergeChainPerFrame: 3,
    positionIterations: 22,
    velocityIterations: 14,
    fixedTimestepMs: 1000 / 60,
    maxSubSteps: 5,
    mergePopVy: -5.2,
    mergePopX: 1.8,
    dropImpulseVy: 0.15,
  },

  /** 等级越高：HP/攻击近似 ×1.75（合成收益） */
  soldiers: {
    1: { name: '民兵', radius: 20, hp: 42, attack: 12, color: '#8B7355', speed: 0.9, attackSpeed: 0.9 },
    2: { name: '弓手', radius: 22, hp: 34, attack: 22, color: '#6B8E23', speed: 1.0, attackSpeed: 0.75 },
    3: { name: '剑士', radius: 24, hp: 72, attack: 40, color: '#4682B4', speed: 1.0, attackSpeed: 0.85 },
    4: { name: '骑士', radius: 26, hp: 115, attack: 75, color: '#DAA520', speed: 1.0, attackSpeed: 0.8 },
    5: { name: '大法师', radius: 28, hp: 88, attack: 135, color: '#9370DB', speed: 0.95, attackSpeed: 0.9 },
    6: { name: '巨龙', radius: 32, hp: 290, attack: 290, color: '#DC143C', speed: 1.0, attackSpeed: 0.75 },
  },

  defenseLane: {
    yTop: 560,
    yBottom: 800,
    /** 城堡左下角锚点（相对防守区） */
    castleMarginLeft: 8,
    castleMarginBottom: 10,
    xLeft: 55,
    xRight: 485,
    enemySpawnX: 478,
    portalYMin: 568,
    portalYMax: 785,
    portalSpawnWidth: 42,
    portalRadius: 28,
    enemyEmergeMs: 480,
    enemyChaseSpeed: 20,
    enemyMarchSpeed: 22,
    soldierChaseSpeed: 72,
  },

  castle: {
    maxHp: 120,
    initialHp: 120,
    collisionDamage: 7,
    width: 48,
    height: 64,
  },

  enemies: {
    goblin: { name: '哥布林', radius: 18, hp: 20, attack: 5, speed: 0.7, color: '#5c4033', reward: 14, attackSpeed: 1.0 },
    wolf: { name: '魔狼', radius: 16, hp: 26, attack: 9, speed: 0.95, color: '#4a4a4a', reward: 17, attackSpeed: 0.95 },
    orc: { name: '兽人', radius: 22, hp: 48, attack: 11, speed: 0.55, color: '#2e8b57', reward: 26, attackSpeed: 1.05 },
    boss: { name: '暗影领主', radius: 30, hp: 240, attack: 20, speed: 0.45, color: '#4b0082', reward: 150, attackSpeed: 1.15, isBoss: true },
  },

  waves: {
    baseEnemies: 2,
    increasePerWave: 1,
    increaseEveryNWaves: 2,
    spawnInterval: 1.6,
    bossEveryWave: 5,
    bossHpMult: 1.55,
    bossAdds: 2,
    waveTimeout: 50,
    firstWaveDelay: 6,
    clearDelay: 5,
    maxActiveEnemies: 12,
    maxEnemiesPerWave: 10,
    waveHpScale: 0.038,
    /** 波次 → 敌人类型权重 { goblin, wolf, orc } */
    typeWeightsByWave: [
      { maxWave: 3, weights: { goblin: 0.85, wolf: 0.15, orc: 0 } },
      { maxWave: 7, weights: { goblin: 0.45, wolf: 0.4, orc: 0.15 } },
      { maxWave: 99, weights: { goblin: 0.25, wolf: 0.35, orc: 0.4 } },
    ],
  },

  economy: {
    startingGold: 96,
    dragSpawnCost: 12,
  },

  /** 掉落队列随机等级权重 */
  dropQueue: {
    weights: [
      { level: 1, p: 0.5 },
      { level: 2, p: 0.28 },
      { level: 3, p: 0.15 },
      { level: 4, p: 0.07 },
    ],
    initialQueue: [1, 2, 1],
  },

  combat: {
    defaultAttackInterval: 0.9,
    enemyAttackMult: 5,
  },

  vfx: {
    mergeDuration: 280,
    damageFlashMs: 100,
    deathFadeMs: 200,
    attackSlashMs: 160,
    attackImpactMs: 240,
    attackPulseMs: 110,
  },
};

export const MAX_SOLDIER_LEVEL = 6;

/** 两单位圆心距上限：碰撞 = 攻击范围 = 感应 = 同级合成边界 */
export function interactionDist(r1, r2) {
  return r1 + r2 + CONFIG.interaction.gap;
}

/** 绘制：圆心到感应/攻击/碰撞外沿 */
export function interactionRingRadius(bodyRadius) {
  return bodyRadius + CONFIG.interaction.gap;
}

/**
 * 数值对照（gap=44，等级1）
 * 球 r=20：圆心距 ≤ 84 碰撞/合成/攻击/外圈 64
 */
