import * as THREE from 'three';
import { PALETTE as P } from './config.js';

/**
 * Transient visuals: muzzle flashes, impact sparks, death puffs, keep rubble
 * and floating damage numbers. All pooled/auto-recycled.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.pool = { spark: [], flash: [] };

    this.sparkGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    this.flashGeo = new THREE.SphereGeometry(0.16, 6, 5);
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a3,
      transparent: true,
      depthWrite: false,
    });
    this.snapMat = new THREE.MeshBasicMaterial({
      color: 0xf2efe4,
      transparent: true,
      depthWrite: false,
    });

    this.burstGeo = new THREE.TetrahedronGeometry(0.22, 0);
  }

  _getSpark() {
    return this.pool.spark.pop() ?? new THREE.Mesh(this.sparkGeo, this.sparkMat.clone());
  }

  /** Fast, physics-less particles: give them a velocity and a lifetime. */
  burst(position, {
    count = 8,
    color = P.blood,
    speed = 4,
    size = 0.22,
    life = 0.5,
    gravity = 14,
    spread = 1,
  } = {}) {
    // Hard ceiling so a chaotic wave can never tank the frame rate.
    if (this.items.length > 320) return;
    if (this.items.length > 220) count = Math.max(2, Math.round(count * 0.4));

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.burstGeo, new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.9,
      }));
      mesh.scale.setScalar((size / 0.22) * (0.6 + Math.random() * 0.8));
      mesh.position.copy(position);
      mesh.castShadow = false;
      this.scene.add(mesh);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.2,
        (Math.random() - 0.5) * 2
      ).normalize();

      this.items.push({
        type: 'burst',
        mesh,
        vel: dir.multiplyScalar(speed * (0.5 + Math.random() * 0.7)),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 14 * spread,
          (Math.random() - 0.5) * 14 * spread,
          (Math.random() - 0.5) * 14 * spread
        ),
        life: life * (0.7 + Math.random() * 0.6),
        maxLife: life,
        gravity,
      });
    }
  }

  /**
   * The crisp pale puff of a released bowstring — deliberately not fiery.
   * Bows don't produce muzzle flash; gunpowder doesn't exist here.
   */
  stringSnap(worldPos, scale = 1) {
    const mesh = new THREE.Mesh(this.flashGeo, this.snapMat.clone());
    mesh.position.copy(worldPos);
    mesh.scale.setScalar(scale * 0.55);
    this.scene.add(mesh);
    this.items.push({ type: 'flash', mesh, life: 0.09, maxLife: 0.09, scale: scale * 0.55 });
  }

  sparks(worldPos, count = 4) {
    for (let i = 0; i < count; i++) {
      const mesh = this._getSpark();
      mesh.position.copy(worldPos);
      const s = 0.6 + Math.random() * 0.9;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.items.push({
        type: 'burst',
        mesh,
        pooled: 'spark',
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          Math.random() * 4 + 1,
          (Math.random() - 0.5) * 6
        ),
        spin: new THREE.Vector3(0, 0, 0),
        life: 0.25,
        maxLife: 0.25,
        gravity: 20,
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;

      if (it.life <= 0) {
        this.scene.remove(it.mesh);
        if (it.pooled === 'spark') this.pool.spark.push(it.mesh);
        else it.mesh.material.dispose?.();
        this.items.splice(i, 1);
        continue;
      }

      if (it.type === 'burst') {
        it.vel.y -= it.gravity * dt;
        it.mesh.position.addScaledVector(it.vel, dt);
        if (it.mesh.position.y < 0.05) {
          it.mesh.position.y = 0.05;
          it.vel.y *= -0.35;
          it.vel.x *= 0.7;
          it.vel.z *= 0.7;
        }
        it.mesh.rotation.x += it.spin.x * dt;
        it.mesh.rotation.y += it.spin.y * dt;
        it.mesh.rotation.z += it.spin.z * dt;
      } else if (it.type === 'flash') {
        const t = it.life / it.maxLife;
        it.mesh.scale.setScalar(it.scale * (0.5 + t * 1.1));
        it.mesh.material.opacity = t;
      }
    }
  }

  dispose() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items.length = 0;
  }
}
