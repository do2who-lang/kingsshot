import * as THREE from 'three';
import { FEEL, KEEP } from './config.js';
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
    this.attackRadius = FEEL.keep.attackRadius;

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
    this.flash = FEEL.keep.flash;
    this.shake = Math.min(1, this.shake + amount / FEEL.keep.shakeGain);

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
    // Once the walls start coming down the collapse owns the transform and the
    // emissive glow — bail out so its shudder and lean aren't damped back.
    if (this.collapseT > 0) return;

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
      const t = clamp(this.healFlash / FEEL.keep.healGlow, 0, 1);
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
      this.shake = Math.max(0, this.shake - dt * FEEL.keep.shakeDecay);
      this.root.position.x = (Math.random() - 0.5) * this.shake * FEEL.keep.shakePos;
      this.root.position.z = (Math.random() - 0.5) * this.shake * FEEL.keep.shakePos;
      this.root.rotation.z = (Math.random() - 0.5) * this.shake * FEEL.keep.shakeRot;
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
  _collapseBurstT = 0;

  /**
   * The keep coming down.
   *
   * A short, heavy sequence rather than a single linear fade: the walls shudder
   * and shed rubble and dust on a steady cadence, the timber hall catches a
   * fiery glow, then the whole castle leans and sinks into its own plaza. Tuned
   * to finish around `KEEP.collapseTime` so the defeat camera has a beat to
   * watch it happen.
   */
  updateCollapse(dt) {
    if (this.collapseT >= 1) return;

    this.collapseT = Math.min(1, this.collapseT + dt / KEEP.collapseTime);
    const t = this.collapseT;

    // Gravity, not a fade: the sink and the lean accelerate, while the shudder
    // is worst as the walls first give way and dies away as it comes to rest.
    const fall = t * t;
    const shudder = (1 - t) * (1 - t);
    const C = FEEL.keep.collapse;

    this.root.position.set(
      (Math.random() - 0.5) * shudder * C.posWobble,
      -fall * C.sink,
      (Math.random() - 0.5) * shudder * C.posWobble
    );
    this.root.rotation.set(
      Math.sin(t * Math.PI * 7) * shudder * C.shudderYaw,
      0,
      fall * C.lean + Math.sin(t * Math.PI * 9) * shudder * C.shudderRoll
    );
    this.root.scale.setScalar(1 - t * C.scale);

    // Everything glows like embers as the timber hall catches light.
    const E = FEEL.keep.ember;
    for (const m of this.materials) {
      m.emissive.setHex(0xff5a22);
      m.emissiveIntensity = E.base + t * E.span * (0.55 + Math.random() * E.jitter);
    }

    // Shed rubble — and the odd gout of flame — from around the walls.
    const R = FEEL.keep.rubble;
    this._collapseBurstT -= dt;
    if (this.effects && this._collapseBurstT <= 0) {
      this._collapseBurstT = R.interval + Math.random() * R.intervalJitter;
      const a = Math.random() * Math.PI * 2;
      const r = R.radius + Math.random() * R.radiusSpan;
      const p = new THREE.Vector3(
        Math.cos(a) * r,
        R.yBase + Math.random() * R.ySpan,
        Math.sin(a) * r
      );
      this.effects.burst(p, {
        count: 6,
        color: 0xbfae92,
        speed: 6.5,
        size: 0.3,
        life: 1.0,
        gravity: 17,
      });
      if (Math.random() < R.fireChance) {
        this.effects.burst(p, {
          count: 3,
          color: 0xffb03a,
          speed: 3.4,
          size: 0.26,
          life: 0.5,
          gravity: 2,
        });
      }
    }
  }
}
