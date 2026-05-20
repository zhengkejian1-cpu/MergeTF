import { interactionDist } from './config.js';

/** 两单位表面进入感应/碰撞范围 */
export function pairInContact(r1, r2, dist) {
  return dist <= interactionDist(r1, r2);
}

/** 接触时的分离向量；未接触返回 null */
export function getContactSeparation(dx, dy, dist, rA, rB) {
  if (!pairInContact(rA, rB, dist)) return null;
  if (dist < 0.001) {
    const angle = ((rA * 7 + rB * 13) % 8) * 0.785;
    dx = Math.cos(angle) * 0.01;
    dy = Math.sin(angle) * 0.01;
    dist = 0.01;
  }
  const minDist = interactionDist(rA, rB);
  return {
    overlap: minDist - dist,
    nx: dx / dist,
    ny: dy / dist,
  };
}
