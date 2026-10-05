import * as THREE from 'three';
import { WALL } from './config.js';
import { createWall } from './models.js';
import { buildHealthBar, healthBarColor } from './buildingUtils.js';
import { clamp } from './utils.js';

/**
 * Which way a wall piece should be turned.
 *
 * A piece that is part of a run must stay square to the grid, or neighbouring
 * panels would no longer meet. A **lone** piece instead turns to present its
 * face to the keep — its run is set perpendicular to the line from the keep to
 * the piece — so a scattered ring of blocks all face inward.
 */
export function wallYaw(mask, x, z) {
  if (mask.n || mask.e || mask.s || mask.w) return 0;
  if (x === 0 && z === 0) return 0;
  return Math.atan2(-x, -z);
}

/**
 * One piece of the perimeter wall.
 *
 * Structurally a wall is the simplest structure — it mounts nothing, yields
 * nothing, and does not upgrade — but it is the only one that *connects*. A
 * piece rebuilds its own model whenever its neighbours change, so laying one
 * beside another produces a continuous rampart with proper corners, straights,
 * T-junctions and ends.
 *
 * Enemies besiege it like any other structure; that is the point. A wall line
 * is what keeps the horde off the keep, and every piece has its own health so a
 * breach opens exactly where the stone gave way.
 */
export class Wall {
  constructor(scene, position, { effects, sfx, mask = {}, cell = { i: 0, j: 0 } } = {}) {
    this.scene = scene;
    this.effects = effects;
    this.sfx = sfx;

    this.kind = 'wall';
    this.name = WALL.name;
    this.level = 1;

    /** Grid coordinates, so the game can find this piece's neighbours. */
    this.cell = cell;

    this.root = new THREE.Group();
    this.root.position.copy(position);
    scene.add(this.root);

    this.blockRadius = WALL.blockRadius;
    this.badgeHeight = WALL.height + 1.1;

    this.maxHealth = WALL.maxHealth;
    this.health = this.maxHealth;
    this.destroyed = false;
    this.collapseT = 0;
    this.hitFlash = 0;
    this._fallDir = Math.random() < 0.5 ? 1 : -1;

    this.materials = [];
    this.mesh = null;
    this.healthBar = null;
    /** The neighbour mask this piece was last shaped from. */
    this.mask = { n: false, e: false, s: false, w: false };
    this._build(mask);
  }

  /** (Re)build the piece's geometry from the supplied neighbour mask. */
  _build(mask) {
    this.mask = { n: !!mask.n, e: !!mask.e, s: !!mask.s, w: !!mask.w };
    if (this.mesh) {
      this.root.remove(this.mesh);
      this._disposeTree(this.mesh);
    }

    const built = createWall(mask);
    this.mesh = built.root;
    this.badgeHeight = built.parts.badgeHeight ?? this.badgeHeight;
    // Only the geometry turns — the health bar stays on the un-rotated root so
    // it keeps facing the camera.
    this.mesh.rotation.y = wallYaw(this.mask, this.root.position.x, this.root.position.z);
    this.root.add(this.mesh);

    // Own the materials so we can flash the whole piece on hit.
    this.materials = [];
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        const original = o.material;
        o.material = original.clone();
        original.dispose();
        this.materials.push(o.material);
      }
    });

    if (this.healthBar) {
      this.root.remove(this.healthBar);
      this._disposeTree(this.healthBar);
    }
    this.healthBar = buildHealthBar();
    this.healthBar.position.y = this.badgeHeight;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);
  }

  /** The game calls this whenever a neighbouring piece is added or removed. */
  setMask(mask) {
    if (this.destroyed) return;
    this._build(mask);
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  get isDamaged() {
    return this.health < this.maxHealth;
  }

  get alive() {
    return !this.destroyed;
  }

  /** Walls are permanent cover, not investments — they never upgrade. */
  get canUpgrade() {
    return false;
  }

  get upgradeCost() {
    return Infinity;
  }

  get upgradeStoneCost() {
    return 0;
  }

  /** Sphere centre enemies use to find and hit this piece. */
  centerWorld(out = new THREE.Vector3()) {
    return out.set(this.root.position.x, this.root.position.y + 0.9, this.root.position.z);
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
    if (this.healthBar) this.healthBar.visible = false;

    const center = this.centerWorld(new THREE.Vector3());
    this.effects?.burst(center, {
      count: 16,
      color: 0x938d80,
      speed: 5.5,
      size: 0.24,
      life: 0.95,
      gravity: 16,
    });
    this.effects?.burst(center, {
      count: 10,
      color: 0x716b5e,
      speed: 4.5,
      size: 0.2,
      life: 0.85,
      gravity: 14,
    });
    this.sfx?.towerDestroyed();
  }

  /** True once the rubble has settled and the piece can be removed. */
  get collapseFinished() {
    return this.destroyed && this.collapseT >= 1;
  }

  /** Point-in-range test used for the repair prompt. */
  distanceTo(pos) {
    return Math.hypot(pos.x - this.root.position.x, pos.z - this.root.position.z);
  }

  update(dt) {
    if (this.destroyed) {
      this._updateCollapse(dt);
      return;
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = this.hitFlash > 0;
      for (const m of this.materials) {
        m.emissive.setHex(on ? 0xff5533 : 0x000000);
        m.emissiveIntensity = on ? 0.8 : 0;
      }
    }

    const hp = this.healthRatio;
    this.healthBar.visible = hp < 1;
    if (hp < 1) {
      this.healthBarFill.scale.x = Math.max(0.001, hp);
      this.healthBarFill.position.x = -(1 - hp) * 0.5;
      this.healthBarFill.material.color.setHex(healthBarColor(hp));
    }
  }

  _updateCollapse(dt) {
    this.collapseT = Math.min(1, this.collapseT + dt / WALL.collapseTime);
    const t = this.collapseT;
    const eased = t * t;

    this.root.rotation.z = eased * (Math.PI / 2 - 0.2) * this._fallDir;
    this.root.position.y = -eased * 0.5;

    const fade = Math.max(0, t - 0.55) / 0.45;
    if (!this._faded) {
      for (const m of this.materials) m.transparent = true;
      this._faded = true;
    }
    for (const m of this.materials) m.opacity = 1 - fade;
  }

  /** Dispose a mesh subtree's geometry and materials exactly once each. */
  _disposeTree(group) {
    const geos = new Set();
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) geos.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    });
    for (const g of geos) g.dispose();
  }

  dispose() {
    this.scene.remove(this.root);
    if (this.mesh) this._disposeTree(this.mesh);
    if (this.healthBar) {
      this.healthBar.traverse((o) => {
        if (o.isMesh && o.material) o.material.dispose();
      });
    }
  }
}
