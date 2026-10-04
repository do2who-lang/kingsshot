import * as THREE from 'three';
import { PALETTE as P, TOWER } from './config.js';
import { makeLabelSprite, mat, add } from './utils.js';
import { box } from './models.js';

/** How close the hero must stand to build here. Matches the dashed square. */
export const PAD_RANGE = 3.3;

/**
 * A build site for one archer tower.
 *
 * Reads as a dashed, glowing square on the grass (like the reference art),
 * with a floating cost badge. Turns green + pulses when the player is standing
 * on it and can afford the build.
 */
export class BuildPad {
  constructor(scene, position, { index = 0, cost = TOWER.buildCost } = {}) {
    this.scene = scene;
    this.cost = cost;
    this.index = index;
    this.built = null;
    /** Multiplier applied to the site price — rubble rebuilds cost less. */
    this.discount = 1;
    this.baseCost = cost;
    this.affordable = false;
    this.hovered = false;

    this.root = new THREE.Group();
    this.root.position.copy(position);
    scene.add(this.root);

    this.baseMat = mat(P.dirtDark, { flatShading: false });
    const base = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), this.baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.03;
    base.receiveShadow = true;
    this.root.add(base);

    // Dashed square = four L-shaped corner brackets.
    this.bracketMat = new THREE.MeshStandardMaterial({
      color: 0xffd93d,
      emissive: new THREE.Color(0xffd93d),
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.1,
    });

    this.armGeoH = new THREE.BoxGeometry(0.8, 0.1, 0.16);
    this.armGeoV = new THREE.BoxGeometry(0.16, 0.1, 0.8);
    this.brackets = [];

    const h = 1.3;
    for (const cx of [-h, h]) {
      for (const cz of [-h, h]) {
        const inX = cx < 0 ? 1 : -1;
        const inZ = cz < 0 ? 1 : -1;

        const armH = new THREE.Mesh(this.armGeoH, this.bracketMat);
        armH.position.set(cx + inX * 0.4, 0.1, cz);
        this.root.add(armH);
        this.brackets.push(armH);

        const armV = new THREE.Mesh(this.armGeoV, this.bracketMat);
        armV.position.set(cx, 0.1, cz + inZ * 0.4);
        this.root.add(armV);
        this.brackets.push(armV);
      }
    }

    // Glow ring that pulses when the pad is buildable.
    this.glowMat = new THREE.MeshBasicMaterial({
      color: P.gold,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 24), this.glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    // Stacked ground decals need real vertical separation or they z-fight into
    // flickering bands. This pad layers: base disc 0.03, kerb ring 0.09,
    // glow ring 0.14 — each comfortably clear of the others and of the terrain.
    this.glow.position.y = 0.14;
    this.root.add(this.glow);

    // Floating cost badge + coin glyph.
    this.label = this._makeBadge(String(cost));
    this.label.position.set(0, 2.2, 0);
    this.root.add(this.label);

    this.coinIcon = makeLabelSprite('\u25CF', { color: '#ffe27a', worldHeight: 0.5, fontSize: 56 });
    this.coinIcon.position.set(0, 2.8, 0);
    this.root.add(this.coinIcon);

    this._baseLabelScale = { x: this.label.scale.x, y: this.label.scale.y };
    this._baseCoinScale = { x: this.coinIcon.scale.x, y: this.coinIcon.scale.y };
  }

  _makeBadge(text) {
    return makeLabelSprite(text, {
      color: '#ffffff',
      background: 'rgba(28,31,38,0.88)',
      border: 'rgba(245,197,24,0.95)',
      worldHeight: 0.95,
    });
  }

  get isBuilt() {
    return this.built !== null;
  }

  /**
   * Plant a tower on this site. The badge stays around so the same spot
   * doubles as the upgrade UI.
   */
  setBuilt(tower) {
    this.built = tower;
    this.glow.visible = false;
    for (const b of this.brackets) b.visible = false;
    this.baseMat.color.setHex(P.dirt);
    this.label.visible = false;
    this.coinIcon.visible = false;
    this._clearRubble();
  }

  /** Re-label an unbuilt site, e.g. after another tower raised the price. */
  setCost(cost) {
    if (this.isBuilt) {
      this.baseCost = cost;
      return;
    }
    this.baseCost = cost;
    const effective = Math.round(cost * this.discount);
    if (this.cost === effective) return;
    this.cost = effective;
    this.label.userData.cost = effective;
    this._rebuildBadge(String(effective));
  }

  /** Rubble sites rebuild cheaply, rewarding the player for holding the line. */
  setDiscount(discount) {
    this.discount = discount;
    this.setCost(this.baseCost ?? this.cost);
  }

  /**
   * A tower here has collapsed. Turn the site back into a build pad, showing
   * the wreckage so it's obvious the tower didn't just vanish.
   *
   * @param {number} discount multiplier applied to the site price, so rebuilding
   *   rubble costs less than raising a brand new tower.
   */
  releaseTower(discount = 1) {
    this.built = null;
    this.discount = discount;
    this.glow.visible = true;
    this.glowMat.opacity = 0;
    for (const b of this.brackets) {
      b.visible = true;
      b.position.y = 0.1;
    }
    this.baseMat.color.setHex(P.dirtDark);
    this.label.visible = true;
    this.coinIcon.visible = true;
    this._showRubble();

    // Always re-render the badge: it was hidden while the tower stood, so its
    // text may be stale even when the number happens to match.
    this.baseCost = this.baseCost ?? this.cost;
    this.cost = Math.round(this.baseCost * this.discount);
    this.label.userData.cost = this.cost;
    this._rebuildBadge(String(this.cost));
  }

  _showRubble() {
    if (this.rubble) return;
    const group = new THREE.Group();

    // Splintered planks and a few broken stones.
    for (const [x, z, rot, len] of [
      [0.35, -0.4, 0.7, 1.1],
      [-0.5, 0.3, -1.1, 0.9],
      [0.1, 0.55, 2.2, 0.8],
    ]) {
      const plank = box(len, 0.12, 0.18, P.wood);
      plank.position.set(x, 0.12, z);
      plank.rotation.y = rot;
      add(group, plank, { receive: true });
    }
    for (const [x, z, r] of [
      [-0.3, -0.5, 0.22],
      [0.55, 0.2, 0.18],
      [-0.6, -0.1, 0.15],
    ]) {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(P.stone));
      stone.position.set(x, r * 0.7, z);
      stone.rotation.set(x, z, r);
      add(group, stone, { receive: true });
    }

    this.rubble = group;
    this.root.add(group);
  }

  _clearRubble() {
    if (!this.rubble) return;
    this.root.remove(this.rubble);
    this.rubble = null;
  }

  /**
   * What the player can do at this site, given an explicit distance and purse.
   *
   * Distance and affordability are passed in rather than read from cached
   * fields so callers never depend on `update()` having run first — the prompt
   * and the action button must always agree, including on the very first frame.
   *
   * @returns {null|{kind:'build'|'upgrade', cost:number, enabled:boolean, pad:BuildPad}}
   */
  actionFor(distance, purse) {
    if (distance >= PAD_RANGE) return null;

    if (!this.isBuilt) {
      return {
        kind: 'build',
        cost: this.cost,
        enabled: purse >= this.cost,
        pad: this,
      };
    }
    if (this.built.canUpgrade) {
      return {
        kind: 'upgrade',
        cost: this.built.upgradeCost,
        enabled: purse >= this.built.upgradeCost,
        level: this.built.level,
        pad: this,
      };
    }
    return null;
  }

  /**
   * Convenience wrapper using the distance cached by the last `update()`.
   * Prefer `actionFor()` in new code.
   */
  get interaction() {
    return this.actionFor(this._lastDist, this._purse ?? 0);
  }

  _rebuildBadge(text) {
    const old = this.label;
    this.root.remove(old);
    old.material.map?.dispose();
    old.material.dispose();

    this.label = this._makeBadge(text);
    this.label.position.set(0, 2.2, 0);
    this.root.add(this.label);
    this._baseLabelScale = { x: this.label.scale.x, y: this.label.scale.y };
  }

  /** True when the hero is standing close enough to interact. */
  get inRange() {
    return this._lastDist < PAD_RANGE;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {number} purse
   */
  update(dt, playerPos, purse) {
    this.time += dt;
    this._purse = purse;

    const dx = playerPos.x - this.root.position.x;
    const dz = playerPos.z - this.root.position.z;
    this._lastDist = Math.hypot(dx, dz);
    this.hovered = this._lastDist < PAD_RANGE;

    if (this.isBuilt) {
      this._updateBuilt(purse);
      return;
    }

    this.affordable = purse >= this.cost;
    const ready = this.hovered && this.affordable;

    // Glow ring.
    const glowTarget = ready ? 0.6 : this.hovered ? 0.25 : 0;
    this.glowMat.opacity += (glowTarget - this.glowMat.opacity) * Math.min(1, dt * 8);
    this.glowMat.color.setHex(ready ? 0x7dff8a : P.gold);
    this.glow.rotation.z += dt * (ready ? 1.8 : 0.4);

    // Bracket colour: green when ready, amber when affordable, red when broke.
    const color = ready ? 0x7dff8a : this.affordable ? 0xffd93d : 0xff6b6b;
    this.bracketMat.color.setHex(color);
    this.bracketMat.emissive.setHex(color);
    this.bracketMat.emissiveIntensity = ready ? 0.95 + Math.sin(this.time * 8) * 0.25 : 0.35;

    // Floating bob.
    for (let i = 0; i < this.brackets.length; i++) {
      this.brackets[i].position.y = 0.1 + Math.sin(this.time * 2.4 + i * 0.5) * 0.06;
    }

    this.label.visible = true;
    this.coinIcon.visible = true;

    const badgePulse = ready ? 1 + Math.sin(this.time * 7) * 0.06 : 1;
    this.label.scale.set(
      this._baseLabelScale.x * badgePulse,
      this._baseLabelScale.y * badgePulse,
      1
    );
    this.label.position.y = 2.2 + Math.sin(this.time * 2.2) * 0.1;
    this.coinIcon.position.y = 2.8 + Math.sin(this.time * 2.2 + 0.5) * 0.1;
  }

  /** Built pads only advertise an upgrade while the hero is standing there. */
  _updateBuilt(purse) {
    const tower = this.built;
    this.cost = tower.canUpgrade ? tower.upgradeCost : Infinity;
    this.affordable = purse >= this.cost;

    const show = this.hovered && tower.canUpgrade;
    if (show && this.label.userData.cost !== this.cost) {
      this.label.userData.cost = this.cost;
      this._rebuildBadge(String(this.cost));
    }

    this.label.visible = show;
    this.coinIcon.visible = show;
    if (!show) return;

    this.coinIcon.material.color.setStyle(this.affordable ? '#b6ffc0' : '#ffb0b0');
    this.label.position.y = 2.6 + Math.sin(this.time * 2.4) * 0.1;
    this.coinIcon.position.y = 3.2 + Math.sin(this.time * 2.4 + 0.5) * 0.1;

    const pulse = this.affordable ? 1 + Math.sin(this.time * 7) * 0.06 : 1;
    this.label.scale.set(
      this._baseLabelScale.x * pulse,
      this._baseLabelScale.y * pulse,
      1
    );
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
