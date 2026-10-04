import * as THREE from 'three';
import { createEnemyModel } from './models.js';
import { randRange, clamp, damp } from './utils.js';

const HIT_FLASH_TIME = 0.12;
const DEATH_TIME = 0.6;

/**
 * One enemy. Three archetypes share this class; behaviour differences come
 * entirely from ENEMY_TYPES (health / speed / damage) plus a few flags.
 */
export class Enemy {
  /**
   * @param {THREE.Scene} scene
   * @param {object} type entry from ENEMY_TYPES
   * @param {object} opts { position, healthScale, speedScale, keep, hero }
   */
  constructor(scene, type, opts = {}) {
    this.scene = scene;
    this.type = type;
    this.keep = opts.keep;
    this.hero = opts.hero;

    this.maxHealth = Math.round(type.maxHealth * (opts.healthScale ?? 1));
    this.health = this.maxHealth;
    this.speed = type.speed * (opts.speedScale ?? 1);
    this.damage = type.damage;
    this.bounty = type.bounty;
    this.alive = true;
    this.dying = false;
    this.deathTimer = 0;
    this.hitFlash = 0;

    this.attackCooldown = randRange(0, 0.4);
    this.attackAnim = 0;
    this.walkPhase = Math.random() * Math.PI * 2;

    const rig = createEnemyModel(type);
    this.root = rig.root;
    this.parts = rig.parts;
    this.root.position.copy(opts.position ?? new THREE.Vector3());
    this.root.rotation.y = Math.random() * Math.PI * 2;

    this.hitRadius = 0.65 * type.scale;
    this.headHeight = 1.15 * type.scale;

    // Enemies must not stack on one pixel at the gate — fan them out.
    this.laneOffsetAngle = randRange(-0.45, 0.45);
    this.laneOffsetRadius = randRange(-1.6, 1.6);

    this._center = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lastVelocity = { x: 0, z: 0 };

    // Remember every material so we can flash the whole model on hit.
    this.materials = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.material) {
        if (o.material.emissive !== undefined) {
          o.material = o.material.clone();
          this.materials.push(o.material);
        }
      }
    });

    this.root.userData.enemy = this;
    scene.add(this.root);

    this.healthBar = createHealthBar();
    this.healthBar.position.y = this.headHeight + 0.75;
    this.healthBarFill = this.healthBar.userData.fill;
    this.root.add(this.healthBar);
  }

  /** Sphere centre used for bullet collisions. */
  centerWorld(out = this._center) {
    return out.set(
      this.root.position.x,
      this.root.position.y + this.headHeight * 0.78,
      this.root.position.z
    );
  }

  /** Where the enemy wants to stand: ringed around the keep, offset per-enemy. */
  _goalPosition(out) {
    const keepPos = this.keep.root.position;
    if (this.laneOffsetAngle === 0) return out.copy(keepPos);
    // Offset around the keep so the horde spreads into an arc.
    const a = this.laneOffsetAngle * 2.2;
    const r = this.keep.attackRadius + 0.4 + this.laneOffsetRadius * 0.6;
    return out.set(
      keepPos.x + Math.sin(a) * r,
      0,
      keepPos.z + Math.cos(a) * r
    );
  }

  takeDamage(amount, fromPosition) {
    if (!this.alive) return;
    this.health -= amount;
    this.hitFlash = HIT_FLASH_TIME;

    if (fromPosition) {
      // Small shove so shots feel like they land.
      const dx = this.root.position.x - fromPosition.x;
      const dz = this.root.position.z - fromPosition.z;
      const d = Math.hypot(dx, dz) || 1;
      this.root.position.x += (dx / d) * 0.1;
      this.root.position.z += (dz / d) * 0.1;
    }

    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  die() {
    if (this.dying) return;
    this.alive = false;
    this.dying = true;
    this.deathTimer = DEATH_TIME;
  }

  /** Called by the game when the death animation has finished. */
  get removable() {
    return this.dying && this.deathTimer <= 0;
  }

  /**
   * @param {number} dt
   * @param {object} ctx { enemies, onAttackKeep, onAttackHero, camera }
   */
  update(dt, ctx) {
    const { bob, legL, legR, aimPivot } = this.parts;

    if (this.dying) {
      this.deathTimer -= dt;
      const t = clamp(1 - this.deathTimer / DEATH_TIME, 0, 1);
      // Topple over and sink into the ground.
      this.root.rotation.z = t * Math.PI * 0.42;
      this.root.position.y = -t * 0.35;
      this.root.scale.setScalar(this.type.scale * (1 - t * 0.25));
      if (this.healthBar) this.healthBar.visible = false;
      this.root.traverse((o) => {
        if (o.isMesh && o.material && o.material.transparent !== undefined) {
          o.material.transparent = true;
          o.material.opacity = 1 - t;
        }
      });
      return;
    }

    // --- Hit flash ---
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = this.hitFlash > 0;
      for (const m of this.materials) {
        m.emissive.setHex(on ? 0xff5533 : 0x000000);
        m.emissiveIntensity = on ? 0.85 : 0;
      }
    }

    const pos = this.root.position;
    const heroPos = this.hero?.root.position;
    const keepPos = this.keep.root.position;

    // --- Choose what to hit ---
    //
    // Priority: a tower near our path (they're real obstacles worth breaking
    // down), then the hero if he's in our face, then the keep.
    //
    // The detection radius deliberately reaches further than the attack range
    // so enemies actually *divert* to towers instead of strolling past them —
    // build pads sit off the lanes, so without the extra reach a tower would
    // almost never be attacked and defending it would never matter.
    const heroDist = heroPos && !this.hero.dead
      ? Math.hypot(heroPos.x - pos.x, heroPos.z - pos.z)
      : Infinity;
    const keepDist = Math.hypot(keepPos.x - pos.x, keepPos.z - pos.z);

    const siegeStop = (tw) => this.type.attackRange * 0.7 + tw.blockRadius;
    /**
     * How far off a tower's doorstep an enemy will notice it.
     *
     * Build pads sit on the diagonals while the spawn gates sit on the axes, so
     * a tower is ~8 units from the nearest lane. With a small radius almost
     * nothing would ever divert and defending a tower would never matter; with a
     * radius that large *everything* diverts and the keep becomes untouchable.
     * This value lands in between, so roughly the inner half of a wave peels off
     * to besiege and the rest presses on to the keep.
     */
    const siegeReach = 5.5;
    const siegeDetect = (tw) => siegeStop(tw) + siegeReach;

    let tower = null;
    let towerDist = Infinity;

    if (ctx.towers) {
      // Stay committed to a tower we already picked. Without this the horde
      // flickers between "besiege" and "march on" every frame at the boundary.
      const committed = this._siegeTower;
      if (committed && committed.alive) {
        const d = Math.hypot(committed.root.position.x - pos.x, committed.root.position.z - pos.z);
        if (d < siegeDetect(committed) + 2.5) {
          tower = committed;
          towerDist = d;
        }
      }

      if (!tower) {
        for (const tw of ctx.towers) {
          if (!tw.alive) continue;
          const d = Math.hypot(tw.root.position.x - pos.x, tw.root.position.z - pos.z);
          if (d < siegeDetect(tw) && d < towerDist) {
            towerDist = d;
            tower = tw;
          }
        }
      }
    }
    this._siegeTower = tower;

    const aggroHero = !tower && heroDist < 5.5 && heroDist < keepDist;

    let targetPos;
    let inRange;
    let onAttack;

    if (tower) {
      targetPos = tower.root.position;
      inRange = towerDist <= siegeStop(tower);
      onAttack = () => ctx.onAttackTower?.(this, this.damage, tower);
    } else if (aggroHero) {
      targetPos = heroPos;
      inRange = heroDist <= this.type.attackRange + 0.8;
      onAttack = () => ctx.onAttackHero?.(this, this.damage);
    } else {
      targetPos = keepPos;
      inRange = keepDist <= this.keep.attackRadius + 0.6;
      onAttack = () => ctx.onAttackKeep?.(this, this.damage);
    }

    // March toward whatever we've committed to.
    const goal = tower || aggroHero ? targetPos : this._goalPosition(this._desired);

    if (!inRange) {
      // --- Advance ---
      const dx = goal.x - pos.x;
      const dz = goal.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;

      let vx = (dx / d) * this.speed;
      let vz = (dz / d) * this.speed;

      // Separation: keep the horde loose instead of a single conga line.
      const sepRadius = 1.05 * this.type.scale;
      for (const other of ctx.enemies) {
        if (other === this || !other.alive) continue;
        const ox = pos.x - other.root.position.x;
        const oz = pos.z - other.root.position.z;
        const od2 = ox * ox + oz * oz;
        if (od2 > 1e-4 && od2 < sepRadius * sepRadius) {
          const od = Math.sqrt(od2);
          const push = (1 - od / sepRadius) * this.speed * 1.6;
          vx += (ox / od) * push;
          vz += (oz / od) * push;
        }
      }

      pos.x += vx * dt;
      pos.z += vz * dt;

      // Face travel direction.
      const faceAngle = Math.atan2(vx, vz);
      this.root.rotation.y = damp(this.root.rotation.y, faceAngle, 8, dt);

      // Remember velocity so towers can lead their shots.
      this._lastVelocity.x = vx;
      this._lastVelocity.z = vz;

      // Walk cycle.
      this.walkPhase += dt * (6 + this.speed * 1.5);
      const swing = Math.sin(this.walkPhase) * 0.55;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      bob.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.07;
      bob.rotation.z = Math.sin(this.walkPhase) * 0.05;
      bob.rotation.x = damp(bob.rotation.x, 0, 8, dt);
      aimPivot.rotation.x = -0.2 + Math.sin(this.walkPhase * 2) * 0.08;
      this.attackAnim = Math.max(0, this.attackAnim - dt * 4);
      aimPivot.rotation.x += this.attackAnim * 1.4;
    } else {
      // --- Attack ---
      legL.rotation.x *= 0.85;
      legR.rotation.x *= 0.85;
      bob.position.y = damp(bob.position.y, 0, 10, dt);

      const faceTarget = Math.atan2(targetPos.x - pos.x, targetPos.z - pos.z);
      this.root.rotation.y = damp(this.root.rotation.y, faceTarget, 10, dt);

      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        this.attackCooldown = 1 / this.type.attackRate;
        this.attackAnim = 1;
        onAttack();
      }

      this.attackAnim = Math.max(0, this.attackAnim - dt * 3.5);
      const lunge = Math.sin(this.attackAnim * Math.PI) * 1.0;
      aimPivot.rotation.x = -0.2 - lunge;
      // Visual forward is -Z, so a negative rotation.x leans the body into it.
      bob.rotation.x = -lunge * 0.25;
    }

    // Keep them inside the map, just in case.
    const limit = 42;
    pos.x = clamp(pos.x, -limit, limit);
    pos.z = clamp(pos.z, -limit, limit);

    // Billboard the health bar.
    if (this.healthBar) {
      const hp = this.health / this.maxHealth;
      this.healthBar.visible = hp < 1;
      this.healthBar.quaternion.copy(ctx.camera.quaternion);
      if (this.healthBarFill) {
        this.healthBarFill.scale.x = Math.max(0.001, hp);
        this.healthBarFill.position.x = -(1 - hp) * 0.5;
        this.healthBarFill.material.color.setHex(
          hp > 0.6 ? 0x5fd35f : hp > 0.3 ? 0xf5c518 : 0xe8452f
        );
      }
    }
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}

/** Small two-quad billboard: dark backing + coloured fill. */
function createHealthBar() {
  const group = new THREE.Group();

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.16),
    new THREE.MeshBasicMaterial({ color: 0x1c1f26, depthTest: false, transparent: true })
  );
  bg.renderOrder = 10;
  group.add(bg);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x5fd35f, depthTest: false, transparent: true })
  );
  fill.position.z = 0.01;
  fill.renderOrder = 11;
  group.add(fill);

  group.userData.fill = fill;
  group.visible = false;
  return group;
}
