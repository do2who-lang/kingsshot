import * as THREE from 'three';
import { WORLD, PALETTE as P, RENDER } from './config.js';
import { add, mat, makeRng } from './utils.js';
import { createRock, createBush, createHouse, createFence } from './models.js';
import { Tree } from './Tree.js';

/**
 * Builds the static scenery: grass field, dirt lanes, spawn gates, cliff border
 * and scattered props. Also returns simple XZ circle colliders so the hero
 * can't walk through tree trunks and boulders.
 */
export function createWorld(scene, { reserved = [] } = {}) {
  const rng = makeRng(90210);
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];
  const spawnGates = [];

  // --- Grass field -------------------------------------------------
  // Deliberately oversized: with the camera pitched this steeply the ground
  // fills the entire frame, so it must never run out before the far plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 1, 1),
    mat(P.grass, { flatShading: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // Mown stripes for that stylized, painted look.
  for (let i = -24; i <= 24; i++) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 3.4),
      mat(i % 2 ? P.grassDark : P.grassLight, { flatShading: false })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.005, i * 6.8);
    stripe.receiveShadow = true;
    root.add(stripe);
  }

  // --- Dirt lanes: a ring road plus four spokes to the gates -------
  //
  // Every ground decal in the scene must sit at a *distinct* height, because
  // several of them overlap and coplanar surfaces z-fight into flickering bands.
  // The constraint graph is not obvious:
  //   grass stripes cross everything            -> lowest
  //   the ring road overlaps the lanes          -> staggered
  //   the ring road ALSO overlaps the build pads (pads sit at radius 11.5 with a
  //   1.9 radius, so they reach in to radius 9.6, and the road runs out to 10.4)
  //                                           -> pad base must differ from it too
  // Current stack: ground 0.00, stripes 0.005, pad base 0.03, ring road 0.06,
  // lanes 0.09, pad glow 0.14.
  const LANE_Y = 0.09;
  const RING_Y = 0.06;

  const lane = (w, l, x, z, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat(P.dirt, { flatShading: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rotY;
    m.position.set(x, LANE_Y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // Ring road around the keep.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(7.6, 10.4, 48),
    mat(P.dirt, { flatShading: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RING_Y;
  ring.receiveShadow = true;
  root.add(ring);

  // Four lanes from the ring out to the gates.
  const lanes = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const a of lanes) {
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const mid = 20;
    lane(5.4, 22, dx * mid, dz * mid, -a);
  }

  // --- Cliff border -------------------------------------------------
  const edge = WORLD.size;
  for (let i = 0; i < 88; i++) {
    const a = (i / 88) * Math.PI * 2;
    const r = edge + 1.5 + rng() * 3;
    const h = 1.6 + rng() * 2.4;
    const cliff = new THREE.Mesh(
      new THREE.BoxGeometry(3.4 + rng() * 1.6, h, 3 + rng() * 1.4),
      mat(rng() > 0.6 ? P.sand : P.rock)
    );
    cliff.position.set(Math.cos(a) * r, h / 2 - 0.4, Math.sin(a) * r);
    cliff.rotation.y = -a + (rng() - 0.5) * 0.5;
    add(root, cliff, { receive: true });
  }

  // --- Spawn gates --------------------------------------------------
  for (const a of lanes) {
    const gate = buildGate(rng);
    const r = WORLD.spawnRadius;
    gate.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    gate.rotation.y = -a + Math.PI;
    root.add(gate);
    spawnGates.push(new THREE.Vector3(gate.position.x, 0, gate.position.z));
  }

  // --- Props --------------------------------------------------------
  const props = [];

  /**
   * Finds a free patch of grass: outside the plaza, off the lanes, clear of the
   * reserved build pads and of everything already placed.
   * @returns {{x:number,z:number}|null}
   */
  const findSpot = (radius) => {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = (rng() - 0.5) * 2 * (edge - 6);
      const z = (rng() - 0.5) * 2 * (edge - 6);
      if (Math.hypot(x, z) < 13) continue; // keep the plaza + ring clear

      const nearLane = lanes.some((a) => {
        const dx = Math.sin(a);
        const dz = Math.cos(a);
        // Distance from the point to the lane axis.
        const along = x * dx + z * dz;
        if (along < 6 || along > 34) return false;
        const perp = Math.abs(x * dz - z * dx);
        return perp < 4.5;
      });
      if (nearLane) continue;
      if (reserved.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + radius + 1.5)) continue;
      if (props.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + radius + 1.2)) continue;

      return { x, z };
    }
    return null;
  };

  const tryPlace = (make, radius, { collide = true } = {}) => {
    const spot = findSpot(radius);
    if (!spot) return null;

    const obj = make(rng);
    obj.position.set(spot.x, 0, spot.z);
    root.add(obj);
    props.push({ ...spot, r: radius });
    if (collide) colliders.push({ x: spot.x, z: spot.z, r: radius + 0.25 });
    return obj;
  };

  // --- Choppable trees ----------------------------------------------
  // These are live entities (not scenery) because the hero can hack them down
  // for wood: they topple, leave a stump, and regrow. Their collision is owned
  // by the Tree itself, so the game can skip felled ones.
  const trees = [];
  for (let i = 0; i < 30; i++) {
    const spot = findSpot(0.9);
    if (!spot) continue;
    trees.push(new Tree(scene, { x: spot.x, z: spot.z, rng }));
    props.push({ ...spot, r: 0.9 });
  }

  for (let i = 0; i < 14; i++) tryPlace(createRock, 0.8);
  for (let i = 0; i < 20; i++) tryPlace(createBush, 0.5, { collide: false });

  // A couple of lootable-looking hamlets for flavour.
  tryPlace(() => createHouse(P.roofRed), 2.2);
  tryPlace(() => createHouse(P.roofBlue), 2.2);

  const fence = createFence(7);
  fence.position.set(0, 0, 0);
  const f = tryPlace(() => fence, 1.0);
  if (f) f.rotation.y = rng() * Math.PI;

  return { root, colliders, spawnGates, trees, propCount: props.length };
}

/** Wooden gate + banner marking where each wave enters from. */
function buildGate(rng) {
  const gate = new THREE.Group();

  const post = (x) => {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 3.4, 6),
      mat(P.woodDark)
    );
    p.position.set(x, 1.7, 0);
    add(gate, p);
  };
  post(-1.5);
  post(1.5);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.55, 0.55), mat(P.wood));
  lintel.position.y = 3.3;
  add(gate, lintel);

  const banner = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.1), mat(P.roofRed));
  banner.position.set(0, 2.35, 0.1);
  add(gate, banner, { cast: false });

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.2), mat(P.sand));
  skull.position.set(0, 2.5, -0.05);
  add(gate, skull, { cast: false });

  for (const x of [-2.6, 2.6]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), mat(P.rock));
    rock.position.set(x, 0.5, rng() * 0.6);
    rock.rotation.set(rng(), rng(), rng());
    add(gate, rock, { receive: true });
  }

  return gate;
}
