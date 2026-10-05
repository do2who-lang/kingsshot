import * as THREE from 'three';
import { COIN, HERO, PALETTE as P } from './config.js';
import { createCoin } from './models.js';
import { randRange } from './utils.js';

/**
 * Manages every loose coin on the ground.
 *
 * Coins are *thrown* out of a dying enemy (initial impulse + gravity + a bounce),
 * settle facing the camera, then fly to the hero once he walks close enough.
 * All tuning lives in the `COIN` block of config.js.
 */
export class CoinManager {
  constructor(scene) {
    this.scene = scene;
    this.coins = [];
    this.totalCollected = 0;
    this.hero = null;
  }

  /** Give the manager a reference so coins know what to magnet toward. */
  attachHero(hero) {
    this.hero = hero;
  }

  /** Throws `count` coins out of `origin` with `value` gold each. */
  drop(origin, count, value) {
    for (let i = 0; i < count; i++) {
      const mesh = createCoin();
      mesh.position.set(
        origin.x + randRange(-COIN.scatter, COIN.scatter),
        origin.y + COIN.dropHeight,
        origin.z + randRange(-COIN.scatter, COIN.scatter)
      );

      // Fan the coins outward in a ring so they scatter like real loot.
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.8;
      const power = randRange(COIN.ringSpeed[0], COIN.ringSpeed[1]);
      this.scene.add(mesh);

      this.coins.push({
        mesh,
        value,
        vel: new THREE.Vector3(
          Math.cos(a) * power,
          randRange(COIN.tossSpeed[0], COIN.tossSpeed[1]),
          Math.sin(a) * power
        ),
        grounded: false,
        age: 0,
        bobPhase: Math.random() * Math.PI * 2,
        magnetized: false,
        speed: 0,
        dead: false,
      });
    }
  }

  /** Number of coins currently on the ground (used by the HUD hint). */
  get pending() {
    return this.coins.length;
  }

  update(dt, { onCollect } = {}) {
    const hero = this.hero;
    const heroPos = hero?.root.position ?? null;

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      const m = c.mesh;

      if (!c.magnetized) {
        // --- Free physics: arc out, land, bounce, settle ---
        if (!c.grounded) {
          c.vel.y -= COIN.gravity * dt;
          m.position.addScaledVector(c.vel, dt);
          m.rotation.x += dt * COIN.tumble[0];
          m.rotation.y += dt * COIN.tumble[1];

          if (m.position.y <= COIN.restY) {
            m.position.y = COIN.restY;
            if (Math.abs(c.vel.y) > COIN.bounceVel) {
              c.vel.y *= COIN.bounceDampY;
              c.vel.x *= COIN.bounceDampXZ;
              c.vel.z *= COIN.bounceDampXZ;
            } else {
              c.vel.set(0, 0, 0);
              c.grounded = true;
              m.rotation.x = Math.PI / 2;
            }
          }
        } else {
          // Idle: gentle spin + bob so they read as collectible.
          const bob = Math.sin(c.age * 3 + c.bobPhase) * COIN.bob;
          m.position.y = COIN.bobBase + bob;
          m.rotation.z += dt * COIN.spin;
        }

        // Blink out near end of life.
        if (c.age > COIN.restLife) {
          const t = (c.age - COIN.restLife) / (COIN.maxLife - COIN.restLife);
          m.visible = Math.sin(c.age * COIN.blinkRate) > COIN.blinkThreshold;
          if (t > COIN.fadeAt) {
            m.scale.setScalar(Math.max(0.02, 1 - (t - COIN.fadeAt) / COIN.fadeSpan));
          }
        }

        if (c.age >= COIN.maxLife) {
          this.scene.remove(m);
          this.coins.splice(i, 1);
          continue;
        }
      }

      // --- Magnet: once close, coins home in and are collected ---
      if (heroPos && !hero.dead) {
        const dx = heroPos.x - m.position.x;
        const dz = heroPos.z - m.position.z;
        const distSq = dx * dx + dz * dz;

        const shouldMagnet =
          c.magnetized ||
          (c.grounded && distSq < HERO.magnetRadius * HERO.magnetRadius);

        if (shouldMagnet) {
          c.magnetized = true;
          c.grounded = true;
          m.position.y += (1.0 - m.position.y) * Math.min(1, dt * COIN.magnetLift);

          const dist = Math.sqrt(distSq) || 1;
          c.speed = Math.min(COIN.magnetMaxSpeed, c.speed + COIN.magnetAccel * dt);
          m.position.x += (dx / dist) * c.speed * dt;
          m.position.z += (dz / dist) * c.speed * dt;
          m.scale.setScalar(Math.max(COIN.shrinkMin, 1 - c.age / COIN.maxLife));
          m.rotation.z += dt * COIN.magnetSpin;

          if (dist < HERO.pickupRadius * COIN.collectPad || m.position.y > COIN.collectHeight) {
            this.totalCollected += c.value;
            this.scene.remove(m);
            this.coins.splice(i, 1);
            onCollect?.(c.value);
            continue;
          }
        }
      }
    }
  }

  clear() {
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.coins.length = 0;
  }
}

/** Exported for tests/tuning — mirrors the live `COIN` config. */
export const COIN_CONSTANTS = {
  GRAVITY: COIN.gravity,
  REST_LIFE: COIN.restLife,
  MAX_LIFE: COIN.maxLife,
  MAGNET_ACCEL: COIN.magnetAccel,
  MAGNET_MAX_SPEED: COIN.magnetMaxSpeed,
  COLOR: P.gold,
};
