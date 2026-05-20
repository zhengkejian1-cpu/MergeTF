import { CONFIG, interactionDist } from './config.js';
import { pairInContact } from './interactionResolve.js';

export function pairCenterDist(bodyA, bodyB, metaA, metaB) {
  const rA = metaA.cfg?.radius ?? bodyA.circleRadius ?? 20;
  const rB = metaB.cfg?.radius ?? bodyB.circleRadius ?? 20;
  const dx = bodyB.position.x - bodyA.position.x;
  const dy = bodyB.position.y - bodyA.position.y;
  return { dist: Math.hypot(dx, dy), rA, rB, dx, dy };
}

/** 同级且已进入感应圈，可尝试合成 */
export function pairShouldTryMerge(r1, r2, dist, levelA, levelB, maxLevel) {
  if (!pairInContact(r1, r2, dist)) return false;
  if (levelA !== levelB || levelA >= maxLevel) return false;
  return true;
}

export function isMergeImmune(meta) {
  return meta?.mergeImmuneUntil && performance.now() < meta.mergeImmuneUntil;
}

export function stampMergeImmunity(meta, ms = null) {
  const dur = ms ?? CONFIG.synthesis.mergeSpawnImmunityMs ?? 70;
  meta.mergeImmuneUntil = performance.now() + dur;
}

export function clampDropX(x, radius) {
  const { leftWall, rightWall } = CONFIG.synthesis;
  return Math.max(leftWall + radius, Math.min(rightWall - radius, x));
}
