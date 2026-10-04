import * as THREE from 'three';
import { buildArrow } from './models.js';

/**
 * Pooled arrows.
 *
 * Arrows are real moving objects (so the player can watch them fly), but
 * collision is a swept segment test against enemy hit spheres, which is cheap
 * and never tunnels even at 50+ units/second.
 *
 * `buildArrow()` authors every arrow pointing along +Z, so orienting one is a
 * single `setFromUnitVectors(+Z, velocity)`.
 */
export class ProjectileSystem {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.bullets = [];
    this.pool = [];

    /** Tower bolts are visibly heavier than the hero's arrows. */
    this.teamScale = { hero: 0.92, tower: 1.3 };

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._ab = new THREE.Vector3();
    this._ap = new THREE.Vector3();
    this._closest = new THREE.Vector3();
    this._center = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._forward = new THREE.Vector3(0, 0, 1);
  }

  _acquire(team) {
    const b = this.pool.pop();
    if (b) {
      b.mesh.visible = true;
      return b;
    }
    return {
      mesh: buildArrow({ length: 0.72 }),
      vel: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      travelled: 0,
    };
  }

  /**
   * @param {object} opts
   * @param {THREE.Vector3} opts.origin
   * @param {THREE.Vector3} opts.direction normalized
   */
  spawn({
    origin,
    direction,
    speed = 40,
    damage = 10,
    range = 16,
    team = 'hero',
  }) {
    const b = this._acquire(team);
    b.mesh.position.copy(origin);
    b.mesh.scale.setScalar(this.teamScale[team] ?? 1);
    b.prev.copy(origin);
    b.vel.copy(direction).normalize().multiplyScalar(speed);
    b.damage = damage;
    b.maxRange = range;
    b.travelled = 0;
    b.team = team;
    b.dead = false;

    // Point the arrow along its travel direction.
    this._dir.copy(b.vel).normalize();
    b.mesh.quaternion.setFromUnitVectors(this._forward, this._dir);

    this.scene.add(b.mesh);
    this.bullets.push(b);
    return b;
  }

  /** Swept segment vs sphere test. Returns the nearest hit along the segment. */
  _sweep(bullet, enemies) {
    const a = this._a.copy(bullet.prev);
    const b = this._b.copy(bullet.mesh.position);
    const ab = this._ab.copy(b).sub(a);
    const abLenSq = ab.lengthSq();
    if (abLenSq < 1e-6) return null;

    let best = null;
    let bestT = Infinity;

    for (const e of enemies) {
      if (!e.alive) continue;
      const r = e.hitRadius;
      const center = e.centerWorld(this._center);
      const ap = this._ap.copy(center).sub(a);
      let t = ap.dot(ab) / abLenSq;
      t = Math.max(0, Math.min(1, t));

      this._closest.copy(a).addScaledVector(ab, t);
      const dx = this._closest.x - center.x;
      const dy = this._closest.y - center.y;
      const dz = this._closest.z - center.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= r * r && t < bestT) {
        bestT = t;
        best = { enemy: e, point: this._closest.clone() };
      }
    }
    return best;
  }

  update(dt, enemies, onHit) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prev.copy(b.mesh.position);
      const speed = b.vel.length();
      b.mesh.position.addScaledVector(b.vel, dt);
      b.travelled += speed * dt;

      const hit = this._sweep(b, enemies);
      if (hit) {
        this.effects.sparks(hit.point, b.team === 'tower' ? 6 : 4);
        this.effects.burst(hit.point, {
          count: 3,
          color: 0xffcf5c,
          speed: 5,
          size: 0.1,
          life: 0.25,
          gravity: 12,
        });
        onHit?.(hit.enemy, b.damage, hit.point);
        this._release(i);
        continue;
      }

      if (b.travelled >= b.maxRange || b.mesh.position.y < 0.05) {
        this._release(i);
      }
    }
  }

  _release(index) {
    const b = this.bullets[index];
    this.scene.remove(b.mesh);
    this.bullets.splice(index, 1);
    b.mesh.visible = false;
    this.pool.push(b);
  }

  clear() {
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets.length = 0;
  }
}
