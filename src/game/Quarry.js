import * as THREE from 'three';
import { QUARRY } from './config.js';
import { createQuarry } from './models.js';
import { buildHealthBar, healthBarColor } from './buildingUtils.js';
import { clamp } from './utils.js';

/**
 * A stone quarry: the player's only source of stone.
 *
 * Structurally the quarry is the quiet sibling of the archer tower — it has
 * health, enemies besiege it, and the hero mends it with wood — but it mounts
 * no weapon. Instead it drip-feeds stone while it stands, and each tier deepens
 * the pit and speeds the trickle.
 *
 * Because stone builds towers, losing a quarry is losing your supply line: the
 * hero can still rebuild it (coins only) but must cross the map to do so.
 */
export class Quarry {
  constructor(scene, position, { effects, sfx, level = 1 } = {}) {
    this.scene = scene;
    this.effects = effects;
    this.sfx = sfx;
    this.level = level;

    /** Identifies the structure to the shared pad/repair/HUD code. */
    this.kind = 'quarry';
    this.name = QUARRY.name;

    const built = createQuarry(level);
    this.root = built.root;
    this.parts = built.parts;
    this.root.position.copy(position);
    scene.add(this.root);

    /** Enemies stop at this radius to hack at the quarry. */
    this.blockRadius = QUARRY.blockRadius;
    /** Clear of the derrick, for the floating health bar. */
    this.badgeHeight = built.parts.badgeHeight ?? 2.6;

    this.maxHealth = 1;
    this.health = 1;
    this.destroyed = false;
    this.collapseT = 0;
    this.hitFlash = 0;
    this._fallDir = 1;

    /** Seconds until the next stone yield. */
    this.incomeTimer = this.stats.yieldInterval;
    this.yields = 0;

    this._center = new THREE.Vector3();

    // Own the materials so we can flash the whole structure on hit.
    this.materials = [];
    this._adoptMaterials();

    this.healthBar = buildHealthBar();
    this.healthBar.position.y = this.badgeHeight;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);

    this.applyLevelStats();
    this.health = this.maxHealth;
  }

  /** Clones every emissive material so flashing this quarry can't affect others. */
  _adoptMaterials() {
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive !== undefined) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
  }

  get stats() {
    return QUARRY.levels[clamp(this.level - 1, 0, QUARRY.levels.length - 1)];
  }

  applyLevelStats() {
    const s = this.stats;
    this.maxHealth = s.maxHealth;
    this.stonePerYield = s.stonePerYield;
    this.yieldInterval = s.yieldInterval;
  }

  get healthRatio() {
    return clamp(this.health / this.maxHealth, 0, 1);
  }

  get isDamaged() {
    return this.health < this.maxHealth;
  }

  /** A standing quarry. Enemies skip destroyed ones when choosing a target. */
  get alive() {
    return !this.destroyed;
  }

  /** Sphere centre enemies use to find and hit this quarry. */
  centerWorld(out = this._center) {
    return out.set(this.root.position.x, this.root.position.y + 1.6, this.root.position.z);
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
    this._fallDir = Math.random() < 0.5 ? 1 : -1;
    if (this.healthBar) this.healthBar.visible = false;

    const center = this.centerWorld(new THREE.Vector3());
    this.effects?.burst(center, {
      count: 22,
      color: 0x8a929c,
      speed: 6,
      size: 0.26,
      life: 1.0,
      gravity: 16,
    });
    this.effects?.burst(center, {
      count: 12,
      color: 0x9c9585,
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
    return this.level < QUARRY.maxLevel;
  }

  /** Coin cost to reach the next tier. */
  get upgradeCost() {
    if (!this.canUpgrade) return Infinity;
    return Math.round(QUARRY.buildCost * QUARRY.upgradeCostScale[this.level]);
  }

  /** Quarries are raised and upgraded with coins alone — no stone sink. */
  get upgradeStoneCost() {
    return 0;
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

    const rebuilt = createQuarry(this.level);
    this.root = rebuilt.root;
    this.parts = rebuilt.parts;
    this.badgeHeight = rebuilt.parts.badgeHeight ?? this.badgeHeight;
    this.root.position.copy(pos);
    this.root.rotation.copy(rot);
    this.scene.add(this.root);

    // The whole model was swapped, so re-adopt materials and re-attach the bar.
    this.materials = [];
    this._adoptMaterials();

    this.healthBar = buildHealthBar();
    this.healthBar.position.y = this.badgeHeight;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);

    // Upgrading reinvigorates the quarry by the health the tier just gained.
    this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - previousMax));
    return true;
  }

  /** Point-in-range test used for the build/repair prompt. */
  distanceTo(pos) {
    return Math.hypot(pos.x - this.root.position.x, pos.z - this.root.position.z);
  }

  /**
   * @param {number} dt
   * @param {object} ctx { onYield(amount, worldPos) }
   */
  update(dt, ctx = {}) {
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

    // --- Passive stone ---
    this.incomeTimer -= dt;
    if (this.incomeTimer <= 0) {
      this.incomeTimer = this.yieldInterval;
      this.yields += 1;
      const p = this.root.position;
      ctx.onYield?.(this.stonePerYield, new THREE.Vector3(p.x, this.badgeHeight + 0.5, p.z));
    }

    // --- Health bar ---
    const hp = this.healthRatio;
    this.healthBar.visible = hp < 1;
    if (hp < 1) {
      this.healthBarFill.scale.x = Math.max(0.001, hp);
      this.healthBarFill.position.x = -(1 - hp) * 0.5;
      this.healthBarFill.material.color.setHex(healthBarColor(hp));
    }
  }

  _updateCollapse(dt) {
    this.collapseT = Math.min(1, this.collapseT + dt / QUARRY.collapseTime);
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
