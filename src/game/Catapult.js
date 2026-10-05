import * as THREE from 'three';
import { CATAPULT, FEEL } from './config.js';
import { createCatapult } from './models.js';
import { buildHealthBar } from './buildingUtils.js';
import { clamp } from './utils.js';

/**
 * Shared boulder visuals. One geometry and one material for every catapult:
 * the shot is a lump of field stone, so there is nothing to vary per engine.
 * Meshes are created per shot (a catapult fires slowly) and removed once the
 * boulder has finished rolling.
 */
const BOULDER_GEO = new THREE.DodecahedronGeometry(FEEL.catapult.boulderRadius, 0);
const BOULDER_MAT = new THREE.MeshStandardMaterial({
  color: 0x7b7468,
  flatShading: true,
  roughness: 0.95,
});
const BOULDER_RADIUS = FEEL.catapult.boulderRadius;

/**
 * The catapult: a rolling-boulder siege engine.
 *
 * It is the *line* weapon. A shot lands on the thickest part of the push
 * (targeting counts neighbours, not just distance), smashes a small area, and
 * then the boulder keeps rolling onward, crushing every enemy it passes over on
 * the way. Funelled enemies get shredded; a wide, scattered advance barely
 * notices it.
 *
 * Two trade-offs keep it honest:
 *   - the slowest reload of any structure, so each shot has to matter;
 *   - no dead zone, but a genuinely heavy footprint, so siting it costs space.
 *
 * Shells and boulders already in flight keep going after it is destroyed.
 */
export class Catapult {
  constructor(scene, position, { effects, sfx, hud, level = 1 } = {}) {
    this.scene = scene;
    this.effects = effects;
    this.sfx = sfx;
    this.hud = hud;
    this.level = level;

    /** Identifies the structure to the shared repair/HUD/enemy code. */
    this.kind = 'catapult';
    this.name = CATAPULT.name;

    const built = createCatapult(level);
    this.root = built.root;
    this.parts = built.parts;
    this.root.position.copy(position);
    scene.add(this.root);

    this.blockRadius = CATAPULT.blockRadius;
    this.turretHeight = built.parts.turretHeight ?? FEEL.catapult.turretHeight;
    this.badgeHeight = built.parts.badgeHeight ?? FEEL.catapult.badgeHeight;
    /** Rest pose of the throwing arm, so the throw animation has a baseline. */
    this._armRest = built.parts.armRest ?? FEEL.catapult.armRest;
    /** How far the arm whips up, shared with the model. */
    this._armSwing = built.parts.armSwing ?? FEEL.catapult.armSwing;

    this.cooldown = FEEL.catapult.initialCooldown;
    this.aimYaw = 0;
    /** Idle is -1; counts up through 0 while a throw plays out. */
    this.throwT = -1;
    this._released = false;
    /** The enemy this throw is aimed at, captured when the wind-up starts. */
    this._target = null;
    this.target = null;
    this.targetTimer = 0;

    /** In-flight boulders on their arc: { mesh, from, to, t, dur, arc, ... }. */
    this.shells = [];
    /** Boulders rolling along the ground after impact. */
    this.boulders = [];

    this.maxHealth = 1;
    this.health = 1;
    this.destroyed = false;
    this.collapseT = 0;
    this.hitFlash = 0;
    this._faded = false;
    this._fallDir = 1;

    this._muzzleWorld = new THREE.Vector3();
    this._impactPoint = new THREE.Vector3();
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

  /** Clones every emissive material so flashing this catapult can't affect others. */
  _adoptMaterials() {
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
  }

  get stats() {
    return CATAPULT.levels[clamp(this.level - 1, 0, CATAPULT.levels.length - 1)];
  }

  applyLevelStats() {
    const s = this.stats;
    this.damage = s.damage;
    this.impactRadius = s.impactRadius;
    this.rollDamage = s.rollDamage;
    this.rollDistance = s.rollDistance;
    this.rollSpeed = s.rollSpeed;
    this.reload = s.reload;
    this.range = s.range;
    this.shellTime = s.shellTime;
    this.maxHealth = s.maxHealth;
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  get isDamaged() {
    return this.health < this.maxHealth;
  }

  /** A standing catapult. Enemies skip destroyed ones when choosing a target. */
  get alive() {
    return !this.destroyed;
  }

  /** Sphere centre enemies use to find and hit this catapult. */
  centerWorld(out = this._center) {
    return out.set(this.root.position.x, this.root.position.y + FEEL.catapult.centreY, this.root.position.z);
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

  /** True once the rubble has settled and the wreck can be cleared. */
  get collapseFinished() {
    return this.destroyed && this.collapseT >= 1;
  }

  get canUpgrade() {
    return this.level < CATAPULT.maxLevel;
  }

  /** Coin cost to reach the next tier. */
  get upgradeCost() {
    if (!this.canUpgrade) return Infinity;
    return Math.round(CATAPULT.buildCost * CATAPULT.upgradeCostScale[this.level]);
  }

  /** Stone blocks needed to reach the next tier. */
  get upgradeStoneCost() {
    if (!this.canUpgrade) return 0;
    return CATAPULT.upgradeStone[this.level] ?? 0;
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

    const rebuilt = createCatapult(this.level);
    this.root = rebuilt.root;
    this.parts = rebuilt.parts;
    this.turretHeight = rebuilt.parts.turretHeight ?? this.turretHeight;
    this.badgeHeight = rebuilt.parts.badgeHeight ?? this.badgeHeight;
    this._armRest = rebuilt.parts.armRest ?? this._armRest;
    this._armSwing = rebuilt.parts.armSwing ?? this._armSwing;
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

    // Upgrading reinvigorates the catapult by the health the tier just gained.
    this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - previousMax));
    return true;
  }

  /** Point-in-range test used for the build/upgrade prompt. */
  distanceTo(pos) {
    return Math.hypot(pos.x - this.root.position.x, pos.z - this.root.position.z);
  }

  /**
   * Aim at the *thickest* part of the push, not the nearest straggler: score
   * every in-range enemy by how many others sit inside the impact radius, then
   * break ties on distance. That is what makes the catapult read as a siege
   * engine — it drops the boulder where the rank is densest and lets it roll.
   */
  _acquireTarget(enemies) {
    const origin = this.root.position;
    const range2 = this.range * this.range;
    const cluster2 = this.impactRadius * this.impactRadius;

    let best = null;
    let bestScore = -1;
    let bestDist = Infinity;

    for (const e of enemies) {
      if (!e.alive) continue;
      const dxe = e.root.position.x - origin.x;
      const dze = e.root.position.z - origin.z;
      const d2 = dxe * dxe + dze * dze;
      if (d2 > range2) continue;

      let neighbours = 0;
      for (const o of enemies) {
        if (!o.alive) continue;
        const dx = o.root.position.x - e.root.position.x;
        const dz = o.root.position.z - e.root.position.z;
        if (dx * dx + dz * dz <= cluster2) neighbours += 1;
      }

      if (neighbours > bestScore || (neighbours === bestScore && d2 < bestDist)) {
        bestScore = neighbours;
        bestDist = d2;
        best = e;
      }
    }
    this.target = best;
  }

  update(dt, enemies) {
    if (this.destroyed) {
      this._updateCollapse(dt);
      this._updateShells(dt, enemies);   // boulders in the air still land…
      this._updateBoulders(dt, enemies); // …and still roll.
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

    const { yaw } = this.parts;

    // Re-acquire a few times a second rather than every frame.
    this.targetTimer -= dt;
    if (this.targetTimer <= 0 || !this.target || !this.target.alive) {
      this.targetTimer = FEEL.catapult.retarget;
      this._acquireTarget(enemies);
    }

    let firing = false;

    if (this.target && this.target.alive) {
      const t = this.target;
      const desiredYaw = Math.atan2(
        t.root.position.x - this.root.position.x,
        t.root.position.z - this.root.position.z
      );
      this.aimYaw = dampAngle(this.aimYaw, desiredYaw, FEEL.catapult.aimLerp, dt);

      const yawErr = Math.abs(shortestAngle(this.aimYaw, desiredYaw));
      this.cooldown -= dt;
      if (this.cooldown <= 0 && yawErr < FEEL.catapult.fireTolerance) {
        this.cooldown = this.reload;
        firing = true;
      }
    } else {
      // Idle sweep, arm at rest.
      this.aimYaw = dampAngle(this.aimYaw, this.aimYaw + dt * FEEL.catapult.idleSweep, FEEL.catapult.idleSweepLerp, dt);
      this.cooldown = Math.min(this.cooldown, this.reload);
    }

    yaw.rotation.y = this.aimYaw;

    // Start a throw: the arm whips up and the boulder is released at the top.
    if (firing) {
      this.throwT = 0;
      this._released = false;
      this._target = this.target;
    }
    this._updateThrow(dt);

    this._updateShells(dt, enemies);
    this._updateBoulders(dt, enemies);

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

  /**
   * Plays out a throw.
   *
   * The arm is cocked low and forward; on release it whips up to roughly 60° in
   * a sixth of a second, the boulder leaves the cup at the top of the arc, and
   * the arm eases back down over the next six tenths. Separating the wind-up
   * from the return *by speed* — fast up, slow down — is what makes it read as
   * a throw rather than the arm simply rising.
   */
  _updateThrow(dt) {
    const arm = this.parts.arm;
    const REST = this._armRest;
    const SWING = this._armSwing;
    const UP = FEEL.catapult.throwUp;
    const DOWN = FEEL.catapult.throwDown;

    if (this.throwT < 0) {
      arm.rotation.x = REST;
      return;
    }

    this.throwT += dt;
    const t = this.throwT;

    let k;
    if (t <= UP) k = easeOutCubic(t / UP);
    else if (t <= UP + DOWN) k = 1 - easeInOutCubic((t - UP) / DOWN);
    else {
      k = 0;
      this.throwT = -1;
    }

    arm.rotation.x = REST + k * SWING;

    // Release at the top of the whip, from wherever the cup is right now.
    if (!this._released && t >= UP) {
      this._released = true;
      this._release();
    }
  }

  /** Hurl the boulder from the cup at the target's predicted ground position. */
  _release() {
    const t = this._target;
    if (!t || !t.alive) return;

    this.parts.muzzle.getWorldPosition(this._muzzleWorld);

    const origin = this.root.position;
    const dist = Math.hypot(
      t.root.position.x - origin.x,
      t.root.position.z - origin.z
    );
    const flight = dist / FEEL.catapult.leadSpeed;
    const lead = t._lastVelocity ?? { x: 0, z: 0 };

    this._impactPoint.set(
      t.root.position.x + lead.x * flight,
      FEEL.catapult.impactY,
      t.root.position.z + lead.z * flight
    );

    const from = this._muzzleWorld.clone();
    const to = this._impactPoint.clone();
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    // The roll carries on away from the catapult, through the rank.
    const dirX = span > 1e-4 ? (to.x - from.x) / span : 0;
    const dirZ = span > 1e-4 ? (to.z - from.z) / span : 1;

    const mesh = new THREE.Mesh(BOULDER_GEO, BOULDER_MAT);
    mesh.position.copy(from);
    this.scene.add(mesh);

    this.shells.push({
      mesh,
      from,
      to,
      t: 0,
      dur: this.shellTime,
      // A high, lobbing arc that scales a little with the throw distance.
      arc: FEEL.catapult.arcBase + span * FEEL.catapult.arcPerUnit,
      damage: this.damage,
      radius: this.impactRadius,
      dirX,
      dirZ,
    });

    this.effects?.burst(from, FEEL.catapult.muzzle);
    this.sfx?.catapultLaunch();
  }

  /** Advance boulders on their arc and crash the ones that land. */
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
      s.mesh.rotation.x += dt * FEEL.catapult.spin[0];
      s.mesh.rotation.z += dt * FEEL.catapult.spin[1];

      if (k >= 1) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        this._crash(s, enemies);
      }
    }
  }

  /**
   * The landing: a small radial smash (with falloff), then the boulder hands off
   * to the rolling phase, which is where the catapult's real damage lives.
   */
  _crash(shell, enemies) {
    const point = shell.to;
    const r2 = shell.radius * shell.radius;
    let total = 0;

    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - point.x;
      const dz = e.root.position.z - point.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      const falloff = FEEL.catapult.falloffInner + (1 - FEEL.catapult.falloffInner) * (1 - d / shell.radius);
      const dealt = Math.max(1, Math.round(shell.damage * falloff));
      e.takeDamage(dealt, point);
      total += dealt;
    }

    for (const b of FEEL.catapult.crash) this.effects?.burst(point, b);
    this.sfx?.boulderCrash();

    if (total > 0) {
      this.hud?.floater(
        new THREE.Vector3(point.x, point.y + 1.0, point.z),
        String(total),
        'dmg'
      );
    }

    // --- And it keeps rolling ---
    const boulder = new THREE.Mesh(BOULDER_GEO, BOULDER_MAT);
    boulder.position.set(point.x, BOULDER_RADIUS, point.z);
    this.scene.add(boulder);
    this.boulders.push({
      mesh: boulder,
      x: point.x,
      z: point.z,
      dirX: shell.dirX,
      dirZ: shell.dirZ,
      travelled: 0,
      distance: this.rollDistance,
      speed: this.rollSpeed,
      damage: this.rollDamage,
      spin: 0,
      hit: new Set(),
    });
  }

  /** Roll each boulder onward, crushing every enemy it passes over (once each). */
  _updateBoulders(dt, enemies) {
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      const step = b.speed * dt;
      b.x += b.dirX * step;
      b.z += b.dirZ * step;
      b.travelled += step;

      // Roll visually about the axis perpendicular to travel.
      b.spin += step / BOULDER_RADIUS;
      b.mesh.position.set(b.x, BOULDER_RADIUS, b.z);
      b.mesh.rotation.set(b.spin * b.dirZ, 0, -b.spin * b.dirX);

      for (const e of enemies) {
        if (!e.alive || b.hit.has(e)) continue;
        const dx = e.root.position.x - b.x;
        const dz = e.root.position.z - b.z;
        const reach = BOULDER_RADIUS + e.hitRadius;
        if (dx * dx + dz * dz > reach * reach) continue;
        b.hit.add(e);
        e.takeDamage(b.damage, new THREE.Vector3(b.x, 0.5, b.z));
        this.effects?.burst(
          new THREE.Vector3(e.root.position.x, 0.6, e.root.position.z),
          FEEL.catapult.rollHit
        );
      }

      // Dust kicked up as it grinds along the ground.
      if (Math.random() < FEEL.catapult.rollDustChance) {
        this.effects?.burst(new THREE.Vector3(b.x, 0.2, b.z), FEEL.catapult.rollDust);
      }

      if (b.travelled >= b.distance) {
        this.scene.remove(b.mesh);
        this.boulders.splice(i, 1);
        this.effects?.burst(new THREE.Vector3(b.x, 0.3, b.z), FEEL.catapult.rollEnd);
      }
    }
  }

  _updateCollapse(dt) {
    this.collapseT = Math.min(1, this.collapseT + dt / CATAPULT.collapseTime);
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
    for (const b of this.boulders) this.scene.remove(b.mesh);
    this.boulders.length = 0;
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}

/** Eases out to 1 quickly — the arm's whip-up. */
function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

/** Cubic ease-in-out — the arm's slower return to rest. */
function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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
