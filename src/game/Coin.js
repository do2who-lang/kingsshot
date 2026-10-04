import * as THREE from 'three';
import { HERO, PALETTE as P } from './config.js';
import { createCoin } from './models.js';
import { randRange } from './utils.js';

const GRAVITY = 26;
const REST_LIFE = 16; // seconds before coins start blinking
const MAX_LIFE = 24; // hard despawn
const MAGNET_ACCEL = 34;
const MAGNET_MAX_SPEED = 22;

/**
 * Manages every loose coin on the ground.
 *
 * Coins are *thrown* out of a dying enemy (initial impulse + gravity + a bounce),
 * settle facing the camera, then fly to the hero once he walks close enough.
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
        origin.x + randRange(-0.25, 0.25),
        origin.y + 0.4,
        origin.z + randRange(-0.25, 0.25)
      );

      // Fan the coins outward in a ring so they scatter like real loot.
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.8;
      const power = randRange(2.6, 5.2);
      this.scene.add(mesh);

      this.coins.push({
        mesh,
        value,
        vel: new THREE.Vector3(
          Math.cos(a) * power,
          randRange(5.5, 8.5),
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
          c.vel.y -= GRAVITY * dt;
          m.position.addScaledVector(c.vel, dt);
          m.rotation.x += dt * 9;
          m.rotation.y += dt * 4;

          if (m.position.y <= 0.14) {
            m.position.y = 0.14;
            if (Math.abs(c.vel.y) > 1.6) {
              c.vel.y *= -0.42;
              c.vel.x *= 0.55;
              c.vel.z *= 0.55;
            } else {
              c.vel.set(0, 0, 0);
              c.grounded = true;
              m.rotation.x = Math.PI / 2;
            }
          }
        } else {
          // Idle: gentle spin + bob so they read as collectible.
          const bob = Math.sin(c.age * 3 + c.bobPhase) * 0.06;
          m.position.y = 0.2 + bob;
          m.rotation.z += dt * 2.2;
        }

        // Blink out near end of life.
        if (c.age > REST_LIFE) {
          const t = (c.age - REST_LIFE) / (MAX_LIFE - REST_LIFE);
          m.visible = Math.sin(c.age * 22) > -0.2;
          if (t > 0.85) m.scale.setScalar(Math.max(0.02, 1 - (t - 0.85) / 0.15));
        }

        if (c.age >= MAX_LIFE) {
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
          m.position.y += (1.0 - m.position.y) * Math.min(1, dt * 10);

          const dist = Math.sqrt(distSq) || 1;
          c.speed = Math.min(MAGNET_MAX_SPEED, c.speed + MAGNET_ACCEL * dt);
          m.position.x += (dx / dist) * c.speed * dt;
          m.position.z += (dz / dist) * c.speed * dt;
          m.scale.setScalar(Math.max(0.35, 1 - c.age / MAX_LIFE));
          m.rotation.z += dt * 16;

          if (dist < HERO.pickupRadius * 0.55 || m.position.y > 0.85) {
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

/** Exported for tests/tuning. */
export const COIN_CONSTANTS = { GRAVITY, REST_LIFE, MAX_LIFE, MAGNET_ACCEL, MAGNET_MAX_SPEED, COLOR: P.gold };
