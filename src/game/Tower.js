import * as THREE from 'three';
import { TOWER } from './config.js';
import { createArcherTower } from './models.js';
import { buildHealthBar } from './buildingUtils.js';
import { clamp, damp } from './utils.js';

/**
 * An autonomous archer tower: a ballista in the belfry of a stone watchtower.
 *
 * Towers are not indestructible scenery. They have health, enemies besiege
 * them, and the hero repairs them with wood. At zero health the tower
 * collapses into rubble, freeing its pad for a discounted rebuild.
 *
 * Three upgrade tiers (see TOWER.levels) raise damage, rate, range *and* health —
 * and make the stonework visibly taller.
 */
export class Tower {
  constructor(scene, position, { effects, projectiles, sfx, level = 1 } = {}) {
    this.scene = scene;
    this.effects = effects;
    this.projectiles = projectiles;
    this.sfx = sfx;
    this.level = level;
    /** Identifies the structure to the shared pad/repair/HUD code. */
    this.kind = 'tower';
    this.name = TOWER.name;

    const built = createArcherTower(level);
    this.root = built.root;
    this.parts = built.parts;
    this.root.position.copy(position);
    scene.add(this.root);

    this.cooldown = Math.random() * 0.4;
    this.charge = 0;
    this.recoil = 0;
    this.target = null;
    this.targetTimer = 0;
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.kills = 0;
    this.shotsFired = 0;

    /** Enemies stop at this radius to hack at the tower. */
    this.blockRadius = TOWER.blockRadius;

    /**
     * Height of the pitch pivot above the tower's base, straight from the model.
     * The tower grows with the tier, so hard-coding this would aim the bolts
     * wrong the moment the player upgraded.
     */
    this.turretHeight = built.parts.turretHeight ?? 2.0;
    /** Clear of the roof, for the floating health bar. */
    this.badgeHeight = built.parts.badgeHeight ?? 3.0;

    this.maxHealth = 1;
    this.health = 1;
    this.destroyed = false;
    this.collapseT = 0;
    this.hitFlash = 0;
    this._fallDir = 1;

    this._muzzleWorld = new THREE.Vector3();
    this._predicted = new THREE.Vector3();
    this._center = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._dir = new THREE.Vector3();

    // Own the materials so we can flash the whole structure on hit.
    this.materials = [];
    this._adoptMaterials();

    this.healthBar = buildHealthBar();
    this.healthBar.position.y = this.badgeHeight;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);

    this.applyLevelStats();
    this.health = this.maxHealth;

    // Make the very first frame consistent.
    this._updateRig();
  }

  /** Clones every emissive material so flashing this tower can't affect others. */
  _adoptMaterials() {
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
  }

  get stats() {
    return TOWER.levels[clamp(this.level - 1, 0, TOWER.levels.length - 1)];
  }

  applyLevelStats() {
    const s = this.stats;
    this.damage = s.damage;
    this.fireRate = s.fireRate;
    this.range = s.range;
    this.projectileSpeed = s.projectileSpeed;
    this.maxHealth = s.maxHealth;
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  get isDamaged() {
    return this.health < this.maxHealth;
  }

  /**
   * A standing tower. Enemies skip destroyed ones when choosing a target, and
   * the repair prompt only offers itself for a tower that still exists.
   */
  get alive() {
    return !this.destroyed;
  }

  /** Sphere centre enemies use to find and hit this tower. */
  centerWorld(out = this._center) {
    return out.set(this.root.position.x, this.root.position.y + 2.0, this.root.position.z);
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = 0.16;
    if (this.health <= 0) this._collapse();
  }

  repair(amount) {
    if (this.destroyed || this.health >= this.maxHealth) return false;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return true;
  }

  _collapse() {
    this.destroyed = true;
    this.collapseT = 0;
    this.target = null;
    this._fallDir = Math.random() < 0.5 ? 1 : -1;
    if (this.healthBar) this.healthBar.visible = false;

    const center = this.centerWorld(new THREE.Vector3());
    this.effects?.burst(center, {
      count: 20,
      color: 0x8a5a2b,
      speed: 6.5,
      size: 0.26,
      life: 1.0,
      gravity: 16,
    });
    this.effects?.burst(center, {
      count: 12,
      color: 0x9d9382,
      speed: 5,
      size: 0.22,
      life: 0.9,
      gravity: 14,
    });
    this.sfx?.towerDestroyed();
  }

  /** True once the rubble has settled and the pad can be reclaimed. */
  get collapseFinished() {
    return this.destroyed && this.collapseT >= 1;
  }

  get canUpgrade() {
    return this.level < TOWER.maxLevel;
  }

  /** Coin cost to reach the next tier. */
  get upgradeCost() {
    if (!this.canUpgrade) return Infinity;
    return Math.round(TOWER.buildCost * TOWER.upgradeCostScale[this.level]);
  }

  /** Stone blocks needed to reach the next tier. */
  get upgradeStoneCost() {
    if (!this.canUpgrade) return 0;
    return TOWER.upgradeStone[this.level] ?? 0;
  }

  /** Rebuild the visual model for the new tier and refresh the stats. */
  upgrade() {
    if (!this.canUpgrade) return false;
    const previousMax = this.maxHealth;

    this.level += 1;
    this.applyLevelStats();

    const pos = this.root.position.clone();
    const rot = this.root.rotation.clone();
    this.scene.remove(this.root);

    const rebuilt = createArcherTower(this.level);
    this.root = rebuilt.root;
    this.parts = rebuilt.parts;
    this.turretHeight = rebuilt.parts.turretHeight ?? this.turretHeight;
    this.badgeHeight = rebuilt.parts.badgeHeight ?? this.badgeHeight;
    this.root.position.copy(pos);
    this.root.rotation.copy(rot);
    this.scene.add(this.root);

    // The whole model was swapped, so re-attach the bar and re-adopt materials.
    this.materials = [];
    this._adoptMaterials();

    this.healthBar = buildHealthBar();
    this.healthBar.position.y = this.badgeHeight;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);

    // Upgrading reinvigorates the tower by the health the tier just gained.
    this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - previousMax));
    this._updateRig();
    return true;
  }

  /** Point-in-range test used for the build/upgrade prompt. */
  distanceTo(pos) {
    return Math.hypot(pos.x - this.root.position.x, pos.z - this.root.position.z);
  }

  _acquireTarget(enemies) {
    const origin = this.root.position;
    let best = null;
    let bestDist = this.range * this.range;

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - origin.x;
      const dz = e.root.position.z - origin.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) {
        bestDist = d2;
        best = e;
      }
    }
    this.target = best;
  }

  update(dt, enemies) {
    if (this.destroyed) {
      this._updateCollapse(dt);
      return;
    }

    // --- Hit flash ---
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = this.hitFlash > 0;
      for (const m of this.materials) {
        m.emissive.setHex(on ? 0xff5533 : 0x000000);
        m.emissiveIntensity = on ? 0.8 : 0;
      }
    }

    const { yaw, pitch } = this.parts;

    // Re-acquire a few times a second rather than every frame.
    this.targetTimer -= dt;
    if (this.targetTimer <= 0 || !this.target || !this.target.alive) {
      this.targetTimer = 0.18;
      this._acquireTarget(enemies);
    }

    let firing = false;

    if (this.target && this.target.alive) {
      const t = this.target;
      const origin = this.root.position;

      // Lead the target a little so fast runners don't slip the bolt.
      const travel = Math.hypot(
        t.root.position.x - origin.x,
        t.root.position.z - origin.z
      ) / this.projectileSpeed;
      const lead = t._lastVelocity ?? { x: 0, z: 0 };
      this._predicted.set(
        t.root.position.x + lead.x * travel,
        t.root.position.y + t.headHeight * 0.75,
        t.root.position.z + lead.z * travel
      );

      const dx = this._predicted.x - origin.x;
      const dz = this._predicted.z - origin.z;
      const distXZ = Math.hypot(dx, dz);

      const desiredYaw = Math.atan2(dx, dz);
      const muzzleY = origin.y + this.turretHeight;
      // The frame is authored along -Z, so a positive pitch tilts it upward.
      const desiredPitch = clamp(
        Math.atan2(this._predicted.y - muzzleY, Math.max(0.001, distXZ)),
        -1.1,
        0.5
      );

      this.aimYaw = dampAngle(this.aimYaw, desiredYaw, 7, dt);
      this.aimPitch = damp(this.aimPitch, desiredPitch, 7, dt);

      // Loose only once roughly on target.
      const yawErr = Math.abs(shortestAngle(this.aimYaw, desiredYaw));
      this.cooldown -= dt;
      if (this.cooldown <= 0 && yawErr < 0.22 && distXZ <= this.range) {
        this.cooldown = 1 / this.fireRate;
        firing = true;
      }
    } else {
      // Idle sweep, with the string relaxed.
      this.aimYaw = dampAngle(this.aimYaw, this.aimYaw + dt * 0.3, 6, dt);
      this.aimPitch = damp(this.aimPitch, -0.05, 4, dt);
      this.cooldown = Math.min(this.cooldown, 1 / this.fireRate);
    }

    yaw.rotation.y = this.aimYaw;
    pitch.rotation.x = this.aimPitch;

    // Recoil kick, applied after aiming so it reads as a snap.
    this.recoil = Math.max(0, this.recoil - dt * 6);
    pitch.position.z += this.recoil * 0.22;
    pitch.rotation.x += this.recoil * 0.1;

    /*
     * The winch draws the string steadily over the reload. Because the draw is
     * derived from the cooldown, releasing the shot resets the cooldown and the
     * string snaps flat on the very same frame — no separate animation state.
     */
    this.charge = firing ? 0 : clamp(1 - this.cooldown * this.fireRate, 0, 1);
    this._updateRig();

    if (firing) this._fire();

    // --- Health bar ---
    const hp = this.healthRatio;
    this.healthBar.visible = hp < 1;
    if (hp < 1) {
      this.healthBarFill.scale.x = Math.max(0.001, hp);
      this.healthBarFill.position.x = -(1 - hp) * 0.5;
      this.healthBarFill.material.color.setHex(
        hp > 0.6 ? 0x8fe07a : hp > 0.3 ? 0xf5c518 : 0xe8452f
      );
    }
  }

  /**
   * Poses the bolt and the two string halves for the current draw amount.
   *
   * The stone tower carries no weapon, so there is nothing here to pose and this
   * returns immediately. It is kept because a tower model that *does* mount
   * something exposes `parts.bolt`/`stringLeft`, and the guard keeps the two
   * shapes interchangeable without the firing code caring which it has.
   */
  _updateRig() {
    const { bolt, stringLeft, stringRight, tips } = this.parts;
    if (!bolt || !stringLeft) return;

    const draw = clamp(this.charge, 0, 1);

    // The bolt slides back along the groove as the string is winched in.
    bolt.position.z = -0.62 + draw * 0.2;

    const dz = draw * 0.18;
    const len = Math.hypot(tips.x, dz);

    stringLeft.position.set(-tips.x, 0, tips.z);
    stringLeft.scale.x = len;
    stringLeft.rotation.y = Math.atan2(-dz, tips.x);

    stringRight.position.set(tips.x, 0, tips.z);
    stringRight.scale.x = len;
    stringRight.rotation.y = Math.atan2(dz, tips.x);
  }

  _fire() {
    const { muzzle, pitch } = this.parts;
    muzzle.getWorldPosition(this._muzzleWorld);

    // Ask the frame's own pivot where it points — correct however it is nested.
    pitch.getWorldQuaternion(this._quat);
    const dir = this._dir.set(0, 0, -1).applyQuaternion(this._quat).normalize();

    // Slight scatter so sustained fire looks organic.
    dir.x += (Math.random() - 0.5) * 0.022;
    dir.y += (Math.random() - 0.5) * 0.022;
    dir.z += (Math.random() - 0.5) * 0.022;
    dir.normalize();

    this.projectiles.spawn({
      origin: this._muzzleWorld,
      direction: dir,
      speed: this.projectileSpeed,
      damage: this.damage,
      range: this.range + 5,
      team: 'tower',
    });

    // Dust knocked loose from the arrow slit. There is no weapon up here — the
    // tower is masonry, and archers inside simply loose through the opening —
    // so this reads as grit shaken off the stones rather than a mechanism.
    this.effects?.burst(this._muzzleWorld, {
      count: 4,
      color: 0xd8cbb0,
      speed: 2.6,
      size: 0.12,
      life: 0.45,
      gravity: 2,
    });
    this.sfx?.bowRelease(true);
    this.shotsFired += 1;
    this.recoil = 1;
  }

  _updateCollapse(dt) {
    this.collapseT = Math.min(1, this.collapseT + dt / TOWER.collapseTime);
    const t = this.collapseT;
    const eased = t * t;

    this.root.rotation.z = eased * (Math.PI / 2 - 0.15) * this._fallDir;
    this.root.position.y = -eased * 0.55;

    // Fade out late, so the topple reads before it disappears.
    const fade = Math.max(0, t - 0.55) / 0.45;
    if (!this._faded) {
      for (const m of this.materials) {
        m.transparent = true;
        this._faded = true;
      }
    }
    for (const m of this.materials) m.opacity = 1 - fade;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}

/** Small two-quad billboard: dark backing + coloured fill. */
function shortestAngle(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2;
  d %= Math.PI * 2;
  return d - Math.PI;
}

function dampAngle(a, b, lambda, dt) {
  return a + shortestAngle(a, b) * (1 - Math.exp(-lambda * dt));
}
