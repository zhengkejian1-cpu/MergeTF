import { CONFIG } from './config.js';
import { getContactSeparation, pairInContact } from './interactionResolve.js';

const { Engine, World, Bodies, Body, Composite, Sleeping } = Matter;

/** 球只与墙/地碰撞；球与球由感应圈自定义挤压 */
const COLLISION_WORLD = 0x0001;
const COLLISION_FRUIT = 0x0002;

export class PhysicsWorld {
  constructor() {
    const syn = CONFIG.synthesis;
    this.engine = Engine.create({
      gravity: { x: 0, y: syn.gravity },
      enableSleeping: true,
      positionIterations: syn.positionIterations ?? 22,
      velocityIterations: syn.velocityIterations ?? 14,
      constraintIterations: 4,
    });
    this.world = this.engine.world;
    this.fruits = new Map();
    this._accumulator = 0;
    this._fixedStep = syn.fixedTimestepMs ?? 1000 / 60;
    this._maxSubSteps = syn.maxSubSteps ?? 5;
    this._createWalls();
  }

  _createWalls() {
    const { leftWall, rightWall } = CONFIG.synthesis;
    const yStart = CONFIG.layout.synthesisTop;
    const floorY = CONFIG.defenseLane.yBottom;
    const syn = CONFIG.synthesis;
    const wallH = 48;
    const midY = (yStart + floorY) / 2;
    const worldFilter = { category: COLLISION_WORLD, mask: COLLISION_FRUIT };
    const sideOpts = {
      isStatic: true,
      friction: syn.wallFriction ?? 0.06,
      frictionStatic: 0.05,
      restitution: syn.wallRestitution ?? 0.1,
      label: 'wall',
      collisionFilter: worldFilter,
      render: { visible: false },
    };
    const groundOpts = {
      ...sideOpts,
      friction: syn.groundFriction ?? 0.28,
      restitution: syn.groundRestitution ?? 0.14,
    };

    const wallHeight = floorY - yStart + 60;
    this.leftWall = Bodies.rectangle(leftWall - 12, midY, 24, wallHeight, sideOpts);
    this.rightWall = Bodies.rectangle(rightWall + 12, midY, 24, wallHeight, sideOpts);
    this.ground = Bodies.rectangle(
      (leftWall + rightWall) / 2,
      floorY + wallH / 2 - 4,
      rightWall - leftWall + 48,
      wallH,
      { ...groundOpts, label: 'ground' }
    );

    World.add(this.world, [this.leftWall, this.rightWall, this.ground]);
  }

  update(deltaMs, tryMergeOnContact = null) {
    this._accumulator += deltaMs;
    let steps = 0;
    while (this._accumulator >= this._fixedStep && steps < this._maxSubSteps) {
      Engine.update(this.engine, this._fixedStep);
      this._accumulator -= this._fixedStep;
      steps++;
    }
    if (steps === this._maxSubSteps) this._accumulator = 0;
    this.resolveFruitContacts(tryMergeOnContact);
  }

  /**
   * 进入感应圈即判定：先尝试合成，否则物理互斥挤压
   */
  resolveFruitContacts(tryMergeOnContact) {
    const syn = CONFIG.synthesis;
    const maxMergeChain = syn.mergeChainPerFrame ?? 3;
    const spring = syn.fruitCollisionSpring ?? 0.45;
    const squeeze = syn.fruitCollisionSqueeze ?? 0.68;
    const restitution = syn.fruitRestitution ?? 0.32;
    const velMul = syn.fruitCollisionVelMul ?? 0.14;
    const pushIters = syn.fruitCollisionIterations ?? 8;
    const radiusOf = (body, meta) => meta?.cfg?.radius ?? body.circleRadius ?? 20;

    const pairActive = (metaA, metaB) =>
      metaA && metaB && !metaA.merging && !metaB.merging && !metaA.dead && !metaB.dead;

    for (let chain = 0; chain < maxMergeChain && tryMergeOnContact; chain++) {
      const bodies = this.getFruitBodies();
      let merged = false;
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const bodyA = bodies[i];
          const bodyB = bodies[j];
          const metaA = this.getMeta(bodyA);
          const metaB = this.getMeta(bodyB);
          if (!pairActive(metaA, metaB)) continue;
          const rA = radiusOf(bodyA, metaA);
          const rB = radiusOf(bodyB, metaB);
          const dx = bodyB.position.x - bodyA.position.x;
          const dy = bodyB.position.y - bodyA.position.y;
          const d = Math.hypot(dx, dy);
          if (!pairInContact(rA, rB, d)) continue;
          if (tryMergeOnContact(bodyA, bodyB)) {
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
      if (!merged) break;
    }

    const bodies = this.getFruitBodies();
    if (bodies.length < 2) return;

    for (let iter = 0; iter < pushIters; iter++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const bodyA = bodies[i];
          const bodyB = bodies[j];
          const metaA = this.getMeta(bodyA);
          const metaB = this.getMeta(bodyB);
          if (!pairActive(metaA, metaB)) continue;

          const rA = radiusOf(bodyA, metaA);
          const rB = radiusOf(bodyB, metaB);
          const dx = bodyB.position.x - bodyA.position.x;
          const dy = bodyB.position.y - bodyA.position.y;
          const d = Math.hypot(dx, dy);
          const sep = getContactSeparation(dx, dy, d, rA, rB);
          if (!sep) continue;

          const massA = rA * rA;
          const massB = rB * rB;
          const total = massA + massB;
          const corr = sep.overlap * spring * squeeze;

          Body.setPosition(bodyA, {
            x: bodyA.position.x - (sep.nx * corr * massB) / total,
            y: bodyA.position.y - (sep.ny * corr * massB) / total,
          });
          Body.setPosition(bodyB, {
            x: bodyB.position.x + (sep.nx * corr * massA) / total,
            y: bodyB.position.y + (sep.ny * corr * massA) / total,
          });

          const rvx = bodyB.velocity.x - bodyA.velocity.x;
          const rvy = bodyB.velocity.y - bodyA.velocity.y;
          const relVn = rvx * sep.nx + rvy * sep.ny;
          if (relVn < 0) {
            const impulse = -(1 + restitution) * relVn * velMul;
            Body.setVelocity(bodyA, {
              x: bodyA.velocity.x - (impulse * sep.nx * massB) / total,
              y: bodyA.velocity.y - (impulse * sep.ny * massB) / total,
            });
            Body.setVelocity(bodyB, {
              x: bodyB.velocity.x + (impulse * sep.nx * massA) / total,
              y: bodyB.velocity.y + (impulse * sep.ny * massA) / total,
            });
          }
          Sleeping.set(bodyA, false);
          Sleeping.set(bodyB, false);
        }
      }
    }
  }

  wakeAllFruits() {
    const bodies = Composite.allBodies(this.world).filter((b) => b.label === 'fruit');
    for (const b of bodies) Sleeping.set(b, false);
  }

  addFruit(body, meta) {
    this.fruits.set(body.id, meta);
    Sleeping.set(body, false);
    World.add(this.world, body);
    return body;
  }

  removeFruit(body) {
    this.fruits.delete(body.id);
    World.remove(this.world, body);
  }

  getMeta(body) {
    return this.fruits.get(body.id);
  }

  fruitCount() {
    return this.fruits.size;
  }

  getFruitBodies() {
    return Composite.allBodies(this.world).filter((b) => b.label === 'fruit');
  }

  getBodyById(id) {
    return this.getFruitBodies().find((b) => b.id === id) ?? null;
  }

  /** 接战时轻微推向敌人，仍由 Matter 重力/碰撞主导 */
  nudgeBodyToward(body, tx, ty, step, blend = 1) {
    const dx = tx - body.position.x;
    const dy = ty - body.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const nudge = Math.min(step * 2.5, 8) * blend;
    Body.setVelocity(body, {
      x: body.velocity.x * 0.85 + (dx / len) * nudge,
      y: body.velocity.y,
    });
    Sleeping.set(body, false);
  }

  clear() {
    for (const body of Composite.allBodies(this.world)) {
      if (body.label === 'fruit') World.remove(this.world, body);
    }
    this.fruits.clear();
    this._accumulator = 0;
  }
}

/** 顶部松手垂直投放（初速度≈0，靠重力下落） */
export function createFruitBody(x, y, level, cfg, mode = 'drop') {
  const syn = CONFIG.synthesis;
  const radius = cfg.radius;
  const area = Math.PI * radius * radius;
  const density = 0.00075 + area * 0.0000028 + level * 0.00018;
  const body = Bodies.circle(x, y, radius, {
    label: 'fruit',
    restitution: syn.fruitRestitution ?? 0.32,
    friction: syn.friction ?? 0.048,
    frictionStatic: syn.frictionStatic ?? 0.035,
    frictionAir: syn.frictionAir ?? 0.011,
    density,
    slop: 0.06,
    collisionFilter: { category: COLLISION_FRUIT, mask: COLLISION_WORLD },
  });
  Sleeping.set(body, false);
  if (mode === 'drop') {
    Body.setVelocity(body, { x: 0, y: syn.dropImpulseVy ?? 0.15 });
    Body.setAngularVelocity(body, 0);
  } else {
    Body.setVelocity(body, {
      x: (Math.random() - 0.5) * 1.2,
      y: -1.5,
    });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
  }
  return body;
}

/** 合成升级弹起 */
export function popMergedFruit(body) {
  const syn = CONFIG.synthesis;
  Sleeping.set(body, false);
  Body.setVelocity(body, {
    x: (Math.random() - 0.5) * (syn.mergePopX ?? 1.8),
    y: syn.mergePopVy ?? -5.2,
  });
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);
}
