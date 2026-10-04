import * as THREE from 'three';
import { KEEP } from './config.js';
import { createKeep } from './models.js';
import { clamp, damp } from './utils.js';

/**
 * The player's castle. It has health, soaks enemy attacks, and drip-feeds a
 * little income so a bad wave can never hard-lock the run.
 */
export class Keep {
  constructor(scene, { sfx, effects } = {}) {
    this.sfx = sfx;
    this.effects = effects;

    this.root = createKeep();
    this.root.position.set(0, 0, 0);
    scene.add(this.root);

    this.maxHealth = KEEP.maxHealth;
    this.health = this.maxHealth;

    /** Enemies stop and attack at this radius from the keep centre. */
    this.attackRadius = 5.2;

    this.flash = 0;
    this.shake = 0;
    /** Drives the green "just repaired" glow. */
    this.healFlash = 0;
    this.incomeTimer = KEEP.incomeInterval;
    this.materials = [];

    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  get isDestroyed() {
    return this.health <= 0;
  }

  damage(amount, hitPosition) {
    if (this.isDestroyed) return;
    this.health = Math.max(0, this.health - amount);
    this.flash = 0.22;
    this.shake = Math.min(1, this.shake + amount / 40);

    if (this.sfx) this.sfx.keepHit();
    if (this.effects) {
      const p = hitPosition ?? new THREE.Vector3(0, 2.2, -3.5);
      this.effects.burst(p, {
        count: 7,
        color: 0xd9c9a3,
        speed: 5.5,
        size: 0.24,
        life: 0.7,
        gravity: 18,
      });
    }
  }

  repair(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  update(dt, { onIncome } = {}) {
    if (this.flash > 0) this.flash -= dt;
    if (this.healFlash > 0) this.healFlash -= dt;

    // Damage wins over repair, so a keep being hit while healing still reads
    // as "in trouble".
    if (this.flash > 0) {
      for (const m of this.materials) {
        m.emissive.setHex(0xff4422);
        m.emissiveIntensity = 0.6;
      }
    } else if (this.healFlash > 0) {
      const t = clamp(this.healFlash / 0.6, 0, 1);
      for (const m of this.materials) {
        m.emissive.setHex(0x6cff7a);
        m.emissiveIntensity = 0.5 * t;
      }
    } else if (this.materials[0]?.emissiveIntensity !== 0) {
      for (const m of this.materials) {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3.5);
      this.root.position.x = (Math.random() - 0.5) * this.shake * 0.28;
      this.root.position.z = (Math.random() - 0.5) * this.shake * 0.28;
      this.root.rotation.z = (Math.random() - 0.5) * this.shake * 0.035;
    } else {
      this.root.position.x = damp(this.root.position.x, 0, 12, dt);
      this.root.position.z = damp(this.root.position.z, 0, 12, dt);
      this.root.rotation.z = damp(this.root.rotation.z, 0, 12, dt);
    }

    // Passive income while the keep stands.
    if (!this.isDestroyed) {
      this.incomeTimer -= dt;
      if (this.incomeTimer <= 0) {
        this.incomeTimer = KEEP.incomeInterval;
        onIncome?.(KEEP.incomeAmount, new THREE.Vector3(0, 6.8, 0));
      }
    }
  }

  /** Collapse animation used on game over. */
  collapseT = 0;
  updateCollapse(dt) {
    this.collapseT = Math.min(1, this.collapseT + dt * 0.9);
    const t = this.collapseT;
    this.root.rotation.z = t * 0.22;
    this.root.position.y = -t * 1.4;
    this.root.scale.setScalar(1 - t * 0.05);
  }
}
