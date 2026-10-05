import * as THREE from 'three';
import { FEEL, TREE, PALETTE as P } from './config.js';
import { createTree, createStump } from './models.js';
import { clamp } from './utils.js';

/**
 * A choppable tree.
 *
 * Stands until the hero hacks it `TREE.chops` times, then topples, leaves a
 * stump, and regrows after `TREE.respawnTime`. This is the game's only source
 * of wood, and the only way to heal the keep.
 *
 * State machine:
 *   standing -> (chops exhausted) -> falling -> felled -> regrowing -> standing
 */
export class Tree {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts { x, z, rng }
   */
  constructor(scene, { x, z, rng = Math.random } = {}) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.rng = rng;

    this.maxChops = TREE.chops;
    this.chopsLeft = TREE.chops;
    this.state = 'standing'; // standing | falling | felled | regrowing

    this.shake = 0;
    this.fallT = 0;
    this.growT = 0;
    this.respawnTimer = 0;
    this.time = Math.random() * 10;
    this._lastDist = Infinity;

    // Yaw of the topple so trees don't all fall the same way.
    this.fallYaw = rng() * Math.PI * 2;

    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    scene.add(this.root);

    // The pivot carries the toppling rotation; the root stays upright.
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    this.treeModel = createTree(rng);
    this.foliage = this.treeModel.userData.foliage;
    this.trunkScale = this.treeModel.scale.x;
    this.pivot.add(this.treeModel);

    this.stumpModel = createStump();
    this.stumpModel.visible = false;
    this.root.add(this.stumpModel);

    /** Collision radius for the hero, ~ the trunk. */
    this.blockRadius = FEEL.tree.blockScale * this.trunkScale + FEEL.tree.blockPad;

    this._buildIndicator();
  }

  /** Segmented bar showing how many chops are left. */
  _buildIndicator() {
    this.indicator = new THREE.Group();
    this.indicator.position.y = FEEL.tree.indicatorY * this.trunkScale;
    this.indicator.visible = false;
    this.root.add(this.indicator);

    this._segments = [];
    const w = 0.26;
    const gap = 0.06;
    const total = this.maxChops * w + (this.maxChops - 1) * gap;

    for (let i = 0; i < this.maxChops; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.13, 0.06),
        new THREE.MeshBasicMaterial({ color: P.plank, depthTest: false })
      );
      seg.position.x = -total / 2 + w / 2 + i * (w + gap);
      seg.renderOrder = 12;
      this.indicator.add(seg);
      this._segments.push(seg);
    }
  }

  /** True while the hero can bump into this tree. */
  get blocks() {
    return this.state === 'standing' || this.state === 'regrowing';
  }

  get isChopped() {
    return this.state !== 'standing';
  }

  /**
   * Whether the hero could swing at this tree from `distance`.
   *
   * Takes the distance explicitly so callers never depend on the cached value
   * from `measureDistance()` — the prompt and the action button must always
   * agree, whichever runs first.
   */
  canChopAt(distance) {
    return this.state === 'standing' && distance < TREE.interactRange;
  }

  /** True when the hero is close enough to swing, per the last measurement. */
  get inRange() {
    return this.canChopAt(this._lastDist);
  }

  /**
   * Take one swing. Returns the wood gained (0 if the tree can't be chopped).
   * The final chop topples the tree.
   */
  chop() {
    if (this.state !== 'standing') return 0;

    this.chopsLeft -= 1;
    this.shake = TREE.shakeTime;

    const gained = TREE.woodPerChop;

    if (this.chopsLeft <= 0) {
      this.state = 'falling';
      this.fallT = 0;
      this.indicator.visible = false;
    } else {
      this._refreshIndicator();
    }
    return gained;
  }

  _refreshIndicator() {
    for (let i = 0; i < this._segments.length; i++) {
      this._segments[i].visible = i < this.chopsLeft;
    }
  }

  /** World position of the trunk mid-height — used for chip particles. */
  chipAnchor(out = new THREE.Vector3()) {
    return out.set(this.x, FEEL.tree.chipAnchorY * this.trunkScale, this.z);
  }

  update(dt, camera) {
    this.time += dt;
    const scale = this.trunkScale;

    switch (this.state) {
      case 'standing': {
        // Chop recoil: a quick, decaying sway of the canopy.
        if (this.shake > 0) {
          this.shake -= dt;
          const t = clamp(this.shake / TREE.shakeTime, 0, 1);
          const wobble = Math.sin(this.time * FEEL.tree.chopWobbleRate) * FEEL.tree.chopWobble * t;
          this.pivot.rotation.z = wobble;
          this.pivot.rotation.x = wobble * 0.6;
        } else if (this.pivot.rotation.z !== 0 || this.pivot.rotation.x !== 0) {
          this.pivot.rotation.z *= 0.82;
          this.pivot.rotation.x *= 0.82;
          if (Math.abs(this.pivot.rotation.z) < 0.001) {
            this.pivot.rotation.set(0, 0, 0);
          }
        }

        // Gentle idle sway so the world doesn't feel frozen.
        if (this.foliage) {
          this.foliage.rotation.z = Math.sin(this.time * FEEL.tree.swayRate + this.x) * FEEL.tree.sway;
        }
        break;
      }

      case 'falling': {
        this.fallT += dt;
        const t = clamp(this.fallT / TREE.fallTime, 0, 1);
        // Ease-in topple — slow start, accelerating fall, like real gravity.
        const eased = t * t;
        this.pivot.rotation.y = this.fallYaw;
        this.pivot.rotation.z = eased * FEEL.tree.fallLean;
        this.pivot.position.y = -eased * FEEL.tree.fallSink * scale;

        if (t >= 1) {
          this.state = 'felled';
          this.respawnTimer = TREE.respawnTime;
          this.pivot.visible = false;
          this.pivot.rotation.set(0, 0, 0);
          this.pivot.position.y = 0;
          this.stumpModel.visible = true;
          this.stumpModel.scale.setScalar(1);
        }
        break;
      }

      case 'felled': {
        this.respawnTimer -= dt;
        // Stump pops away right before the sapling returns.
        if (this.respawnTimer < FEEL.tree.stumpHide) {
          this.stumpModel.visible = false;
        }
        if (this.respawnTimer <= 0) {
          this.state = 'regrowing';
          this.growT = 0;
          this.chopsLeft = this.maxChops;
          this._refreshIndicator();
          this.pivot.visible = true;
          this.pivot.scale.setScalar(FEEL.tree.regrowStart);
        }
        break;
      }

      case 'regrowing': {
        this.growT += dt;
        const t = clamp(this.growT / FEEL.tree.regrowTime, 0, 1);
        // Slight overshoot for a springy pop back into existence.
        const eased = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
        const overshoot = Math.sin(t * Math.PI) * 0.06;
        this.pivot.scale.setScalar(FEEL.tree.regrowStart + eased * FEEL.tree.regrowSpan + overshoot);

        if (t >= 1) {
          this.pivot.scale.setScalar(1);
          this.state = 'standing';
        }
        break;
      }

      default:
        break;
    }

    // --- Indicator ---
    if (this.state === 'standing') {
      const show = this.inRange || this.chopsLeft < this.maxChops;
      this.indicator.visible = show;
      if (show && camera) {
        this.indicator.quaternion.copy(camera.quaternion);
        this.indicator.position.y =
          3.4 * scale + Math.sin(this.time * 2) * 0.06;
      }
    }
  }

  /** Distance bookkeeping, called once per frame by the game. */
  measureDistance(playerPos) {
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    this._lastDist = Math.hypot(dx, dz);
    return this._lastDist;
  }

  /** Restore to a freshly grown tree (used on restart). */
  reset() {
    this.state = 'standing';
    this.chopsLeft = this.maxChops;
    this.shake = 0;
    this.fallT = 0;
    this.growT = 0;
    this.respawnTimer = 0;
    this._lastDist = Infinity;

    this.pivot.visible = true;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.position.y = 0;
    this.pivot.scale.setScalar(1);
    this.stumpModel.visible = false;
    this.indicator.visible = false;
    this._refreshIndicator();
  }

  dispose() {
    this.scene.remove(this.root);
    for (const seg of this._segments) seg.material.dispose();
  }
}
