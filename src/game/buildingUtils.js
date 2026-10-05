import * as THREE from 'three';

/**
 * The small two-quad billboard every player structure floats above itself: a
 * dark backing plus a coloured fill. Towers and quarries share it so a damaged
 * building reads the same whichever kind it is.
 *
 * The returned group exposes its fill mesh on `userData.fill`; callers scale it
 * and recolour it from the structure's health ratio.
 */
export function buildHealthBar() {
  const group = new THREE.Group();

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x1c1f26, depthTest: false, transparent: true })
  );
  bg.renderOrder = 10;
  group.add(bg);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 0.11),
    new THREE.MeshBasicMaterial({ color: 0x8fe07a, depthTest: false, transparent: true })
  );
  fill.position.z = 0.01;
  fill.renderOrder = 11;
  group.add(fill);

  group.userData.fill = fill;
  group.visible = false;
  return group;
}

/** Green → amber → red as a structure is worn down. */
export function healthBarColor(ratio) {
  return ratio > 0.6 ? 0x8fe07a : ratio > 0.3 ? 0xf5c518 : 0xe8452f;
}
