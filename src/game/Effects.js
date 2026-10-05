import * as THREE from 'three';
import { FX } from './config.js';

/**
 * Transient visuals: muzzle flashes, impact sparks, death puffs, keep rubble
 * and floating damage numbers. All pooled/auto-recycled.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.pool = { spark: [], flash: [] };

    this.sparkGeo = new THREE.BoxGeometry(FX.geo.spark, FX.geo.spark, FX.geo.spark);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    this.flashGeo = new THREE.SphereGeometry(FX.geo.flashSphere, 6, 5);
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

    this.burstGeo = new THREE.TetrahedronGeometry(FX.geo.burst, 0);
  }

  _getSpark() {
    return this.pool.spark.pop() ?? new THREE.Mesh(this.sparkGeo, this.sparkMat.clone());
  }

  /** Fast, physics-less particles: give them a velocity and a lifetime. */
  burst(position, {
    count = FX.burst.count,
    color = FX.burst.color,
    speed = FX.burst.speed,
    size = FX.burst.size,
    life = FX.burst.life,
    gravity = FX.burst.gravity,
    spread = FX.burst.spread,
  } = {}) {
    // Hard ceiling so a chaotic wave can never tank the frame rate.
    if (this.items.length > FX.maxItems) return;
    if (this.items.length > FX.throttleAt) count = Math.max(2, Math.round(count * FX.throttleScale));

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.burstGeo, new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.9,
      }));
      mesh.scale.setScalar((size / FX.geo.burst) * (FX.sizeJitter[0] + Math.random() * FX.sizeJitter[1]));
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
        vel: dir.multiplyScalar(speed * (FX.speedJitter[0] + Math.random() * FX.speedJitter[1])),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * FX.spin * spread,
          (Math.random() - 0.5) * FX.spin * spread,
          (Math.random() - 0.5) * FX.spin * spread
        ),
        life: life * (FX.lifeJitter[0] + Math.random() * FX.lifeJitter[1]),
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
    mesh.scale.setScalar(scale * FX.stringSnap.scale);
    this.scene.add(mesh);
    this.items.push({ type: 'flash', mesh, life: FX.stringSnap.life, maxLife: FX.stringSnap.life, scale: scale * FX.stringSnap.scale });
  }

  sparks(worldPos, count = FX.sparks.count) {
    for (let i = 0; i < count; i++) {
      const mesh = this._getSpark();
      mesh.position.copy(worldPos);
      const s = FX.sparks.scale[0] + Math.random() * FX.sparks.scale[1];
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.items.push({
        type: 'burst',
        mesh,
        pooled: 'spark',
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * FX.sparks.spreadXZ,
          Math.random() * FX.sparks.upRange + FX.sparks.upBase,
          (Math.random() - 0.5) * FX.sparks.spreadXZ
        ),
        spin: new THREE.Vector3(0, 0, 0),
        life: FX.sparks.life,
        maxLife: FX.sparks.life,
        gravity: FX.sparks.gravity,
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
          it.vel.y *= FX.bounce.y;
          it.vel.x *= FX.bounce.xz;
          it.vel.z *= FX.bounce.xz;
        }
        it.mesh.rotation.x += it.spin.x * dt;
        it.mesh.rotation.y += it.spin.y * dt;
        it.mesh.rotation.z += it.spin.z * dt;
      } else if (it.type === 'flash') {
        const t = it.life / it.maxLife;
        it.mesh.scale.setScalar(it.scale * (FX.flashExpand[0] + t * FX.flashExpand[1]));
        it.mesh.material.opacity = t;
      }
    }
  }

  dispose() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items.length = 0;
  }
}
