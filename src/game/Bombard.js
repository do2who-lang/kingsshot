import * as THREE from 'three';
import { BOMBARD, FEEL } from './config.js';
import { createBombard } from './models.js';
import { buildHealthBar } from './buildingUtils.js';
import { clamp, damp } from './utils.js';

/**
 * Shared shell visuals — one geometry and one material for every bombard, since
 * the shot is a plain stone ball. Meshes are created per shot (a mortar fires
 * slowly, so the churn is trivial) and removed on impact.
 */
const SHELL_GEO = new THREE.IcosahedronGeometry(FEEL.bombard.shellSize, 0);
const SHELL_MAT = new THREE.MeshStandardMaterial({
  color: 0x2f343b,
  flatShading: true,
  roughness: 0.85,
});

/**
 * The bombard: a stone-throwing mortar.
 *
 * It is the crowd-control answer to the archer tower's single target. Instead of
 * a hitscan arrow it lobs a shell in a high arc and bursts it over a radius,
 * damaging every enemy caught in the blast with falloff toward the rim.
 *
 * The trade-offs are deliberate and define the unit:
 *   - a long reload, so it punctuates the fight rather than streaming shots;
 *   - a **dead zone** (`minRange`) it cannot depress the barrel into, so anything
 *     that closes to its doorstep is safe. Towers hold the line; the bombard
 *     thins the horde on the way in.
 *
 * Shells it has already launched keep flying after it is destroyed, so a kill on
 * a bombard mid-flight doesn't rob the shot of its damage.
 *
 * Lives in its own class rather than reusing `ProjectileSystem`, which is built
 * around swept arrow collision, not arcs and radial damage.
 */
export class Bombard {
  constructor(scene, position, { effects, sfx, hud, level = 1 } = {}) {
    this.scene = scene;
    this.effects = effects;
    this.sfx = sfx;
    this.hud = hud;
    this.level = level;

    /** Identifies the structure to the shared repair/HUD/enemy code. */
    this.kind = 'bombard';
    this.name = BOMBARD.name;

    const built = createBombard(level);
    this.root = built.root;
    this.parts = built.parts;
    this.root.position.copy(position);
    scene.add(this.root);

    this.blockRadius = BOMBARD.blockRadius;
    this.turretHeight = built.parts.turretHeight ?? FEEL.bombard.turretHeight;
    this.badgeHeight = built.parts.badgeHeight ?? FEEL.bombard.badgeHeight;
    /** Authored barrel elevation, so recoil can kick off a known rest angle. */
    this._elev = built.parts.barrelPivot?.rotation.x ?? FEEL.bombard.restElevation;

    this.cooldown = FEEL.bombard.initialCooldown;
    this.aimYaw = 0;
    this.recoil = 0;
    this.target = null;
    this.targetTimer = 0;

    /** In-flight shells: { mesh, from, to, t, dur, arc, damage, blast }. */
    this.shells = [];

    this.maxHealth = 1;
    this.health = 1;
    this.destroyed = false;
    this.collapseT = 0;
    this.hitFlash = 0;
    this._faded = false;
    this._fallDir = 1;

    this._muzzleWorld = new THREE.Vector3();
    this._impact = new THREE.Vector3();
    this._center = new THREE.Vector3();

    // Own the materials so a hit can flash the whole structure.
    this.materials = [];
    this._adoptMaterials();

    this.healthBar = buildHealthBar();
    this.healthBar.position.y = this.badgeHeight;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);

    this.applyLevelStats();
    this.health = this.maxHealth;
  }

  /** Clones every emissive material so flashing this bombard can't affect others. */
  _adoptMaterials() {
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
  }

  get stats() {
    return BOMBARD.levels[clamp(this.level - 1, 0, BOMBARD.levels.length - 1)];
  }

  applyLevelStats() {
    const s = this.stats;
    this.damage = s.damage;
    this.reload = s.reload;
    this.range = s.range;
    this.minRange = s.minRange;
    this.blastRadius = s.blastRadius;
    this.shellTime = s.shellTime;
    this.maxHealth = s.maxHealth;
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  get isDamaged() {
    return this.health < this.maxHealth;
  }

  /** A standing bombard. Enemies skip destroyed ones when choosing a target. */
  get alive() {
    return !this.destroyed;
  }

  /** Sphere centre enemies use to find and hit this bombard. */
  centerWorld(out = this._center) {
    return out.set(this.root.position.x, this.root.position.y + FEEL.bombard.centreY, this.root.position.z);
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);
    this.hitFlash = FEEL.hitFlash;
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
      color: 0x6b727b,
      speed: 6.5,
      size: 0.26,
      life: 1.0,
      gravity: 16,
    });
    this.effects?.burst(center, {
      count: 12,
      color: 0x4d5560,
      speed: 5,
      size: 0.22,
      life: 0.9,
      gravity: 14,
    });
    this.sfx?.towerDestroyed();
  }

  /** True once the rubble has settled and the wreck can be cleared. */
  get collapseFinished() {
    return this.destroyed && this.collapseT >= 1;
  }

  get canUpgrade() {
    return this.level < BOMBARD.maxLevel;
  }

  /** Coin cost to reach the next tier. */
  get upgradeCost() {
    if (!this.canUpgrade) return Infinity;
    return Math.round(BOMBARD.buildCost * BOMBARD.upgradeCostScale[this.level]);
  }

  /** Stone blocks needed to reach the next tier. */
  get upgradeStoneCost() {
    if (!this.canUpgrade) return 0;
    return BOMBARD.upgradeStone[this.level] ?? 0;
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

    const rebuilt = createBombard(this.level);
    this.root = rebuilt.root;
    this.parts = rebuilt.parts;
    this.turretHeight = rebuilt.parts.turretHeight ?? this.turretHeight;
    this.badgeHeight = rebuilt.parts.badgeHeight ?? this.badgeHeight;
    this._elev = rebuilt.parts.barrelPivot?.rotation.x ?? this._elev;
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

    // Upgrading reinvigorates the bombard by the health the tier just gained.
    this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - previousMax));
    return true;
  }

  /** Point-in-range test used for the build/upgrade prompt. */
  distanceTo(pos) {
    return Math.hypot(pos.x - this.root.position.x, pos.z - this.root.position.z);
  }

  /**
   * Nearest enemy that is inside firing range *and* outside the dead zone.
   * Anything already inside `minRange` is deliberately ignored.
   */
  _acquireTarget(enemies) {
    const origin = this.root.position;
    const min2 = this.minRange * this.minRange;
    let best = null;
    let bestD2 = this.range * this.range;

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - origin.x;
      const dz = e.root.position.z - origin.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < min2) continue; // too close to lob a shell at
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    this.target = best;
  }

  update(dt, enemies) {
    if (this.destroyed) {
      this._updateCollapse(dt);
      this._updateShells(dt, enemies); // shells already in the air still land.
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

    const { yaw, barrelPivot } = this.parts;

    // Re-acquire a few times a second rather than every frame.
    this.targetTimer -= dt;
    if (this.targetTimer <= 0 || !this.target || !this.target.alive) {
      this.targetTimer = FEEL.bombard.retarget;
      this._acquireTarget(enemies);
    }

    let firing = false;

    if (this.target && this.target.alive) {
      const t = this.target;
      const origin = this.root.position;
      const dx = t.root.position.x - origin.x;
      const dz = t.root.position.z - origin.z;
      const desiredYaw = Math.atan2(dx, dz);

      this.aimYaw = dampAngle(this.aimYaw, desiredYaw, FEEL.bombard.aimLerp, dt);

      const yawErr = Math.abs(shortestAngle(this.aimYaw, desiredYaw));
      this.cooldown -= dt;
      if (this.cooldown <= 0 && yawErr < FEEL.bombard.fireTolerance) {
        this.cooldown = this.reload;
        firing = true;
      }
    } else {
      // Idle sweep, barrel at rest.
      this.aimYaw = dampAngle(this.aimYaw, this.aimYaw + dt * FEEL.bombard.idleSweep, FEEL.bombard.idleSweepLerp, dt);
      this.cooldown = Math.min(this.cooldown, this.reload);
    }

    yaw.rotation.y = this.aimYaw;

    // Recoil kick: the barrel slams back along +Z and lifts.
    this.recoil = Math.max(0, this.recoil - dt * FEEL.bombard.recoilDecay);
    barrelPivot.position.z = this.recoil * FEEL.bombard.recoilZ;
    barrelPivot.rotation.x = this._elev + this.recoil * FEEL.bombard.recoilPitch;

    if (firing) this._fire();
    this._updateShells(dt, enemies);

    // --- Health bar ---
    const hp = this.healthRatio;
    this.healthBar.visible = hp < 1;
    if (hp < 1) {
      this.healthBarFill.scale.x = Math.max(0.001, hp);
      this.healthBarFill.position.x = -(1 - hp) * 0.5;
      this.healthBarFill.material.color.setHex(
        hp > FEEL.barGood ? 0x8fe07a : hp > FEEL.barWarn ? 0xf5c518 : 0xe8452f
      );
    }
  }

  /** Launch a shell at the target's predicted ground position. */
  _fire() {
    const t = this.target;
    const muzzle = this.parts.muzzle;
    muzzle.getWorldPosition(this._muzzleWorld);

    // Lead the target so fast runners don't stroll out of the blast.
    const origin = this.root.position;
    const dist = Math.hypot(
      t.root.position.x - origin.x,
      t.root.position.z - origin.z
    );
    const flight = dist / FEEL.bombard.leadSpeed;
    const lead = t._lastVelocity ?? { x: 0, z: 0 };

    this._impact.set(
      t.root.position.x + lead.x * flight,
      FEEL.bombard.impactY,
      t.root.position.z + lead.z * flight
    );

    const from = this._muzzleWorld.clone();
    const to = this._impact.clone();
    const span = Math.hypot(to.x - from.x, to.z - from.z);

    const mesh = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    mesh.position.copy(from);
    this.scene.add(mesh);

    this.shells.push({
      mesh,
      from,
      to,
      t: 0,
      dur: this.shellTime,
      // Higher lob for longer shots, so the arc always reads as a mortar.
      arc: FEEL.bombard.arcBase + span * FEEL.bombard.arcPerUnit,
      damage: this.damage,
      blast: this.blastRadius,
    });

    this.effects?.burst(from, FEEL.bombard.muzzle);
    this.sfx?.mortarLaunch();
    this.recoil = 1;
  }

  /** Advance every shell along its arc and burst the ones that land. */
  _updateShells(dt, enemies) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = clamp(s.t / s.dur, 0, 1);

      s.mesh.position.set(
        s.from.x + (s.to.x - s.from.x) * k,
        s.from.y + (s.to.y - s.from.y) * k + Math.sin(Math.PI * k) * s.arc,
        s.from.z + (s.to.z - s.from.z) * k
      );
      s.mesh.rotation.x += dt * FEEL.bombard.spin[0];
      s.mesh.rotation.y += dt * FEEL.bombard.spin[1];

      if (k >= 1) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        this._explode(s.to, s.damage, s.blast, enemies);
      }
    }
  }

  /**
   * Burst a shell: damage every enemy inside `blast` with falloff toward the
   * rim, then sell it with fire, shrapnel and dust. One floating total, rather
   * than a number per enemy, keeps a big hit from spamming the screen.
   */
  _explode(point, damage, blast, enemies = []) {
    const r2 = blast * blast;
    let total = 0;

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - point.x;
      const dz = e.root.position.z - point.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      const falloff = FEEL.bombard.falloffInner + (1 - FEEL.bombard.falloffInner) * (1 - d / blast);
      const dealt = Math.max(1, Math.round(damage * falloff));
      e.takeDamage(dealt, point);
      total += dealt;
    }

    for (const b of FEEL.bombard.blast) this.effects?.burst(point, b);
    this.sfx?.explosion();

    if (total > 0) {
      this.hud?.floater(
        new THREE.Vector3(point.x, point.y + 1.0, point.z),
        String(total),
        'dmg'
      );
    }
  }

  _updateCollapse(dt) {
    this.collapseT = Math.min(1, this.collapseT + dt / BOMBARD.collapseTime);
    const t = this.collapseT;
    const eased = t * t;

    this.root.rotation.z = eased * FEEL.collapse.lean * this._fallDir;
    this.root.position.y = -eased * FEEL.collapse.sink;

    // Fade out late, so the topple reads before it disappears.
    const fade = Math.max(0, t - FEEL.collapse.fadeStart) / FEEL.collapse.fadeSpan;
    if (!this._faded) {
      for (const m of this.materials) {
        m.transparent = true;
        this._faded = true;
      }
    }
    for (const m of this.materials) m.opacity = 1 - fade;
  }

  dispose() {
    for (const s of this.shells) this.scene.remove(s.mesh);
    this.shells.length = 0;
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}

/** Shortest signed angle from `a` to `b`. */
function shortestAngle(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2;
  d %= Math.PI * 2;
  return d - Math.PI;
}

/** Exponential smoothing across the shortest arc. */
function dampAngle(a, b, lambda, dt) {
  return a + shortestAngle(a, b) * (1 - Math.exp(-lambda * dt));
}
