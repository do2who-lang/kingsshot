import * as THREE from 'three';
import { HERO, WORLD, PALETTE as P } from './config.js';
import { createCharacter } from './models.js';
import { clamp, damp, randRange } from './utils.js';

/**
 * Where the archer starts each run: at the keep, just clear of its plaza.
 *
 * He begins with his **back to the base**, facing outward, so the opening shot
 * frames him from the front with the keep rising behind him. `facing` uses the
 * usual `atan2(dx, dz)` yaw convention: 0 points along +Z, away from the keep.
 */
export const HERO_SPAWN = { x: 0, z: 6, facing: 0 };

/**
 * The hero: a coin-hungry archer who walks where you point him and
 * automatically looses arrows at the most threatening enemy in range.
 */
export class Player {
  constructor(scene, { projectiles, effects, sfx } = {}) {
    this.scene = scene;
    this.projectiles = projectiles;
    this.effects = effects;
    this.sfx = sfx;

    const rig = createCharacter({
      shirt: P.player,
      shirtDark: P.playerDark,
      pants: 0x2f3a4b,
      skin: P.skin,
      hair: 0x4a3524,
    });
    this.root = rig.root;
    this.parts = rig.parts;
    this.root.position.set(HERO_SPAWN.x, 0, HERO_SPAWN.z);
    scene.add(this.root);

    this.maxHealth = HERO.maxHealth;
    this.health = this.maxHealth;
    this.dead = false;

    this.facing = HERO_SPAWN.facing; // yaw
    this.aimYaw = HERO_SPAWN.facing;
    this.moveSpeed = WORLD.playerSpeed;
    this.currentSpeed = 0;
    this.walkPhase = 0;

    this.cooldown = 0;
    this.recoil = 0;
    this.charge = 0;
    this.hitFlash = 0;
    this.timeSinceDamage = HERO.regenDelay;
    this.target = null;
    this.targetTimer = 0;
    this.range = HERO.weapon.range;

    this.stepTimer = 0;
    this._muzzleWorld = new THREE.Vector3();
    this._predicted = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._dir = new THREE.Vector3();

    /** Decaying knock-back impulse applied on hit. */
    this.velocityKick = { x: 0, z: 0 };

    this.materials = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });

    this.rig = rig;
  }

  get position() {
    return this.root.position;
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  takeDamage(amount, fromPosition) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = 0.16;
    this.timeSinceDamage = 0;
    this.sfx?.heroHurt();

    if (fromPosition) {
      const dx = this.root.position.x - fromPosition.x;
      const dz = this.root.position.z - fromPosition.z;
      const d = Math.hypot(dx, dz) || 1;
      this.velocityKick.x += (dx / d) * 5;
      this.velocityKick.z += (dz / d) * 5;
    }

    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.timeSinceDamage = HERO.regenDelay;
  }

  _acquireTarget(enemies) {
    const origin = this.root.position;
    const facing = this.facing;
    const assist = (HERO.weapon.aimAssist * Math.PI) / 180;

    let best = null;
    let bestScore = Infinity;

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - origin.x;
      const dz = e.root.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.range) continue;

      // Prefer what's in front of the hero, then whatever is closest.
      const angle = Math.atan2(dx, dz);
      const diff = Math.abs(
        (((angle - facing + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI
      );
      const score = dist + (diff > assist ? 30 : 0) + diff * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    this.target = best;
  }

  /**
   * @param {number} dt
   * @param {object} ctx
   * @param {{x:number,z:number}} ctx.move normalized movement intent
   * @param {Array} ctx.enemies
   * @param {(pos:THREE.Vector3)=>void} ctx.collide clamp position against the world
   */
  update(dt, ctx) {
    const { bob, legL, legR, aimPivot, bow } = this.parts;

    if (this.dead) {
      // Ragdoll-ish collapse.
      this.root.rotation.z = damp(this.root.rotation.z, Math.PI * 0.45, 6, dt);
      this.root.position.y = damp(this.root.position.y, -0.25, 5, dt);
      return;
    }

    // --- Damage flash ---
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = this.hitFlash > 0;
      for (const m of this.materials) {
        m.emissive.setHex(on ? 0xff3322 : 0x000000);
        m.emissiveIntensity = on ? 0.8 : 0;
      }
    }

    // --- Health regen out of combat ---
    this.timeSinceDamage += dt;
    if (this.timeSinceDamage > HERO.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + HERO.regenPerSecond * dt);
    }

    // --- Movement ---
    const mx = ctx.move.x;
    const mz = ctx.move.z;
    const mag = Math.min(1, Math.hypot(mx, mz));
    this.currentSpeed = damp(this.currentSpeed, mag * this.moveSpeed, 12, dt);

    if (mag > 0.05) {
      const nx = mx / (Math.hypot(mx, mz) || 1);
      const nz = mz / (Math.hypot(mx, mz) || 1);
      this.root.position.x += nx * this.currentSpeed * dt;
      this.root.position.z += nz * this.currentSpeed * dt;
    }

    // Knock-back impulse decays quickly.
    this.root.position.x += this.velocityKick.x * dt;
    this.root.position.z += this.velocityKick.z * dt;
    this.velocityKick.x = damp(this.velocityKick.x, 0, 9, dt);
    this.velocityKick.z = damp(this.velocityKick.z, 0, 9, dt);

    ctx.collide?.(this.root.position);

    // --- Walk animation ---
    const moving = this.currentSpeed > 0.35;
    if (moving) {
      this.walkPhase += dt * (7 + this.currentSpeed * 1.1);
      const swing = Math.sin(this.walkPhase) * 0.5;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      bob.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;
      bob.rotation.z = Math.sin(this.walkPhase) * 0.045;
    } else {
      this.walkPhase = 0;
      legL.rotation.x = damp(legL.rotation.x, 0, 10, dt);
      legR.rotation.x = damp(legR.rotation.x, 0, 10, dt);
      bob.position.y = damp(bob.position.y, Math.sin(performance.now() / 600) * 0.02, 6, dt);
      bob.rotation.z = damp(bob.rotation.z, 0, 8, dt);
    }

    // Footstep dust puffs.
    if (moving) {
      this.stepTimer -= dt * this.currentSpeed;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.55;
        this.effects.burst(
          new THREE.Vector3(this.root.position.x, 0.15, this.root.position.z),
          { count: 2, color: 0xd8cba8, speed: 1.4, size: 0.14, life: 0.4, gravity: 4 }
        );
      }
    }

    // --- Targeting ---
    this.targetTimer -= dt;
    if (this.targetTimer <= 0 || !this.target || !this.target.alive) {
      this.targetTimer = 0.15;
      this._acquireTarget(ctx.enemies);
    }

    const t = this.target;
    const hasTarget = t && t.alive;

    // Face the target while shooting, otherwise face travel direction.
    let desiredFacing = this.facing;
    if (hasTarget) {
      desiredFacing = Math.atan2(
        t.root.position.x - this.root.position.x,
        t.root.position.z - this.root.position.z
      );
    } else if (mag > 0.05) {
      desiredFacing = Math.atan2(mx, mz);
    }
    this.facing = dampAngle(this.facing, desiredFacing, 11, dt);
    this.root.rotation.y = this.facing;

    // --- Aim + fire ---
    const origin = this.root.position;
    if (hasTarget) {
      const travel = Math.hypot(
        t.root.position.x - origin.x,
        t.root.position.z - origin.z
      ) / HERO.weapon.arrowSpeed;
      this._predicted.set(
        t.root.position.x + t._lastVelocity.x * travel,
        t.root.position.y + t.headHeight * 0.8,
        t.root.position.z + t._lastVelocity.z * travel
      );

      const dx = this._predicted.x - origin.x;
      const dz = this._predicted.z - origin.z;
      const distXZ = Math.hypot(dx, dz);
      const desiredAim = Math.atan2(dx, dz);

      this.aimYaw = dampAngle(this.aimYaw, desiredAim, 16, dt);
      // The barrel is authored along -Z, so a positive pitch tilts it upward.
      const pitch = clamp(
        Math.atan2(this._predicted.y - 1.05, Math.max(0.001, distXZ)),
        -0.9,
        0.5
      );

      // aimPivot sits inside a root that already has `facing`, so subtract it.
      aimPivot.rotation.y = this.aimYaw - this.facing;
      aimPivot.rotation.x = pitch;

      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.cooldown = 1 / HERO.weapon.fireRate;
        this._fire();
      }
    } else {
      aimPivot.rotation.y = dampAngle(aimPivot.rotation.y, 0, 8, dt);
      aimPivot.rotation.x = damp(aimPivot.rotation.x, -0.12, 6, dt);
      this.cooldown = Math.min(this.cooldown, 0.12);
    }

    this.recoil = Math.max(0, this.recoil - dt * 9);
    bow.position.z = -0.58 + this.recoil * 0.16;
    aimPivot.rotation.x += this.recoil * 0.09;

    /*
     * The draw is derived from the reload timer, so loosing an arrow resets
     * the cooldown and the string snaps flat on that same frame — no separate
     * animation state to keep in sync.
     */
    const reload = 1 / HERO.weapon.fireRate;
    this.charge = hasTarget ? clamp(1 - this.cooldown / reload, 0, 1) : 0;
    this._updateBowRig();
  }

  /**
   * Poses the bowstring and the nocked arrow for the current draw amount.
   * The string is two unit boxes pivoted at each nock, scaled to reach the
   * draw point and rotated to aim at it — a real bend, not a sliding sprite.
   */
  _updateBowRig() {
    const { stringTop, stringBottom, nockedArrow, bowTips } = this.parts;
    if (!stringTop) return;

    /*
     * How far the string is pulled back toward the archer, in metres.
     *
     * Kept deliberately short: the string now correctly sits on the archer's
     * side of the grip, so a long pull would drag it inside the hero's chest.
     */
    const DRAW_REACH = 0.14;

    const draw = clamp(this.charge, 0, 1);

    nockedArrow.visible = draw > 0.02;

    // Everything moves in +Z (toward the archer) as the bow is drawn, which is
    // what makes the tips sit *behind* the grip at rest.
    nockedArrow.position.z = bowTips.z + draw * DRAW_REACH;

    // Half-span of the string, plus how far back the fingers have pulled it.
    const dz = draw * DRAW_REACH;
    const len = Math.hypot(bowTips.y, dz);

    stringTop.position.set(0, bowTips.y, bowTips.z);
    stringTop.scale.y = len;
    stringTop.rotation.x = Math.atan2(-dz, bowTips.y);

    stringBottom.position.set(0, -bowTips.y, bowTips.z);
    stringBottom.scale.y = len;
    stringBottom.rotation.x = Math.atan2(dz, bowTips.y);
  }

  _fire() {
    const { bow } = this.parts;
    bow.getWorldPosition(this._muzzleWorld);

    const dir = this._dir.set(0, 0, -1).applyQuaternion(bow.getWorldQuaternion(this._quat));

    // A little scatter so volleys look organic; bows stay accurate.
    const spread = HERO.weapon.spread;
    dir.x += randRange(-spread, spread);
    dir.y += randRange(-spread, spread);
    dir.z += randRange(-spread, spread);
    dir.normalize();

    this.projectiles.spawn({
      origin: this._muzzleWorld,
      direction: dir,
      speed: HERO.weapon.arrowSpeed,
      damage: HERO.weapon.damage,
      range: this.range + 8,
      team: 'hero',
    });

    this.effects.stringSnap(this._muzzleWorld, 0.8);
    this.sfx?.bowRelease(false);
    this.recoil = 1;
    this.charge = 0;
  }

  reset() {
    this.health = this.maxHealth;
    this.dead = false;
    this.root.position.set(HERO_SPAWN.x, 0, HERO_SPAWN.z);
    this.root.rotation.set(0, HERO_SPAWN.facing, 0);
    this.facing = HERO_SPAWN.facing;
    this.aimYaw = HERO_SPAWN.facing;
    this.cooldown = 0;
    this.recoil = 0;
    this.charge = 0;
    this.currentSpeed = 0;
    this.timeSinceDamage = HERO.regenDelay;
    this.velocityKick.x = 0;
    this.velocityKick.z = 0;
    this.target = null;
    for (const m of this.materials) {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
      m.opacity = 1;
      m.transparent = false;
    }
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.opacity !== undefined) {
        o.material.opacity = 1;
        o.material.transparent = false;
      }
    });
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}
