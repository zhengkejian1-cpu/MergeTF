import { interactionRingRadius } from './config.js';

/** 感应/攻击/碰撞外圈（全局统一 gap） */
export function drawInteractionRing(ctx, x, y, bodyRadius, alpha = 0.3) {
  const R = interactionRingRadius(bodyRadius);
  ctx.strokeStyle = `rgba(255,160,60,${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}
