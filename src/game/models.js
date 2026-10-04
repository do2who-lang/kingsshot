import * as THREE from 'three';
import { PALETTE as P } from './config.js';
import { add, mat } from './utils.js';

/* ------------------------------------------------------------------ *
 * Tiny primitive helpers — everything in the game is built from these
 * ------------------------------------------------------------------ */

export function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  return m;
}

export function cyl(rTop, rBottom, h, color, segments = 8, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, segments),
    mat(color, opts)
  );
  return m;
}

export function cone(r, h, color, segments = 4, opts = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, segments), mat(color, opts));
  return m;
}

export function sphere(r, color, opts = {}) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color, opts));
}

export function capsule(radius, length, color, opts = {}) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat(color, opts));
}

/**
 * A single arrow, authored pointing along **+Z** (head at +Z, fletching at -Z)
 * so the projectile system can orient it with a simple
 * `setFromUnitVectors(+Z, velocity)`. Callers that need it pointing -Z (the rig's
 * forward, e.g. a nocked arrow) should rotate it by PI themselves.
 */
export function buildArrow({
  length = 0.72,
  shaftColor = 0x8a5a2b,
  headColor = 0x9aa3ad,
  fletchColor = 0xc0392b,
} = {}) {
  const arrow = new THREE.Group();

  const shaft = cyl(0.017, 0.017, length, shaftColor, 5);
  shaft.rotation.x = Math.PI / 2;
  add(arrow, shaft);

  // Cone points +Y by default; a quarter turn aims it down +Z.
  const head = cone(0.042, 0.15, headColor, 4);
  head.rotation.x = Math.PI / 2;
  head.position.z = length / 2 + 0.06;
  add(arrow, head);

  // Two crossed vanes at the tail.
  for (const horizontal of [false, true]) {
    const fin = horizontal
      ? box(0.1, 0.012, 0.17, fletchColor)
      : box(0.012, 0.1, 0.17, fletchColor);
    fin.position.z = -length / 2 + 0.09;
    add(arrow, fin, { cast: false });
  }

  return arrow;
}

/* ------------------------------------------------------------------ *
 * Characters
 * ------------------------------------------------------------------ */

/**
 * Builds a chunky low-poly humanoid.
 *
 * The rig is authored facing -Z, but every facing calculation in the game uses
 * the usual `rotation.y = Math.atan2(dx, dz)` convention, which points an
 * object's local +Z at the target. A 180° `flip` group bridges the two so the
 * model's visual "front" (nose, gun, eyes) ends up on +Z.
 *
 * The returned `parts` object is what the animation code drives:
 *   root      – position + yaw
 *   flip      – internal 180° correction, never animate this
 *   bob       – vertical bounce while walking
 *   legL/legR – rotate.x to stride
 *   aimPivot  – rotate.y to aim, holds both arms and the gun
 *   gun       – translate.z for recoil
 */
export function createCharacter({
  shirt = P.player,
  shirtDark = P.playerDark,
  pants = 0x35404f,
  skin = P.skin,
  hair = 0x3a2a1c,
  accessory = null,
  scale = 1,
} = {}) {
  const root = new THREE.Group();
  const flip = new THREE.Group();
  flip.rotation.y = Math.PI;
  root.add(flip);

  const bob = new THREE.Group();
  flip.add(bob);

  const skinMat = mat(skin);
  const shirtMat = mat(shirt);
  const shirtDarkMat = mat(shirtDark);

  // --- Legs (pivot at hip height so they swing naturally) ---
  const hipY = 0.52;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [group, x] of [
    [legL, -0.15],
    [legR, 0.15],
  ]) {
    group.position.set(x, hipY, 0);
    const leg = capsule(0.115, 0.3, pants);
    leg.position.y = -0.21;
    add(group, leg);
    const boot = box(0.24, 0.14, 0.32, 0x2b2b30);
    boot.position.set(0, -0.44, 0.04);
    add(group, boot);
    bob.add(group);
  }

  // --- Torso ---
  const torso = box(0.62, 0.62, 0.42, shirt);
  torso.position.y = hipY + 0.3;
  add(bob, torso);

  const belt = box(0.64, 0.1, 0.44, shirtDark);
  belt.position.y = hipY + 0.03;
  add(bob, belt);

  // --- Head ---
  const head = box(0.44, 0.42, 0.42, skin);
  head.position.y = hipY + 0.82;
  add(bob, head);

  const hairMesh = box(0.47, 0.16, 0.45, hair);
  hairMesh.position.y = hipY + 1.02;
  add(bob, hairMesh);

  const nose = box(0.1, 0.1, 0.1, skin);
  nose.position.set(0, hipY + 0.8, -0.24);
  add(bob, nose, { cast: false });

  for (const x of [-0.12, 0.12]) {
    const eye = box(0.07, 0.09, 0.05, 0x22252b);
    eye.position.set(x, hipY + 0.87, -0.22);
    add(bob, eye, { cast: false });
  }

  // --- Aim pivot: arms + weapon all rotate together ---
  const aimPivot = new THREE.Group();
  aimPivot.position.y = hipY + 0.52;
  bob.add(aimPivot);

  const shoulderL = box(0.18, 0.18, 0.18, shirt);
  shoulderL.position.set(-0.36, 0.02, 0);
  add(aimPivot, shoulderL);

  const shoulderR = box(0.18, 0.18, 0.18, shirt);
  shoulderR.position.set(0.36, 0.02, 0);
  add(aimPivot, shoulderR);

  // Arms reach forward (-Z is forward in this rig).
  const armFront = box(0.16, 0.16, 0.5, shirtDark);
  armFront.position.set(-0.2, -0.06, -0.3);
  add(aimPivot, armFront);

  const armBack = box(0.16, 0.16, 0.42, shirtDark);
  armBack.position.set(0.24, -0.02, -0.18);
  add(aimPivot, armBack);

  const handFront = box(0.17, 0.17, 0.17, skin);
  handFront.position.set(-0.18, -0.06, -0.56);
  add(aimPivot, handFront);

  // --- Weapon: a longbow, nocked and drawn ---
  //
  // Authored pointing -Z (the rig's forward before the flip). The bow is held
  // out in front, the string runs between two tips, and a nocked arrow rides
  // the string: pulling back during the draw and snapping forward on release.
  const bow = new THREE.Group();
  // Held a touch further out than the old backwards-facing build: with the
  // string correctly on the archer's side of the grip, a full draw brings it
  // back close to the chest. -0.68 puts the grip level with the front of the
  // hand (-0.645) so the bow still reads as gripped, with clearance behind it.
  bow.position.set(-0.16, -0.02, -0.68);
  bow.userData.isWeapon = true;
  aimPivot.add(bow);

  /*
   * Bow orientation — the stave must arc AWAY from the archer (-Z, toward the
   * target) so the string ends up on the archer's side of the grip.
   *
   * Reading out from the archer the order is: string, grip, target. That is why
   * the limb/tip offsets below are POSITIVE (toward the archer, +Z) while the
   * grip sits at the bow group's origin: the tips and the string are pulled back
   * toward the hand, and the riser bows forward past them.
   *
   * Authoring the tips on the -Z side instead puts the string between the grip
   * and the enemy, which reads as the hero holding the bow backwards.
   */
  const BOW_TIP_Y = 0.42;
  const BOW_TIP_Z = 0.19; // toward the archer, behind the grip
  const BOW_WOOD = 0x7a4a1f;

  const grip = box(0.062, 0.22, 0.08, 0x4e3418);
  add(bow, grip);

  for (const sign of [1, -1]) {
    // Riser between the grip and the working limb, leaning back toward the hand.
    const riser = box(0.048, 0.2, 0.06, BOW_WOOD);
    riser.position.set(0, sign * 0.19, 0.05);
    riser.rotation.x = sign * 0.38;
    add(bow, riser);

    const limb = box(0.044, 0.34, 0.05, BOW_WOOD);
    limb.position.set(0, sign * 0.32, 0.115);
    limb.rotation.x = sign * 0.46;
    add(bow, limb);

    // Pale tip nock so the string has something to land on.
    const nock = box(0.05, 0.06, 0.05, 0xd8c9a8);
    nock.position.set(0, sign * BOW_TIP_Y, BOW_TIP_Z);
    add(bow, nock, { cast: false });
  }

  // Two-segment string that bends toward the archer as the bow is drawn.
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xe8e2d0 });
  const stringGeoDown = new THREE.BoxGeometry(0.016, 1, 0.016);
  stringGeoDown.translate(0, -0.5, 0);
  const stringGeoUp = new THREE.BoxGeometry(0.016, 1, 0.016);
  stringGeoUp.translate(0, 0.5, 0);

  const stringTop = new THREE.Mesh(stringGeoDown, stringMat);
  stringTop.position.set(0, BOW_TIP_Y, BOW_TIP_Z);
  bow.add(stringTop);

  const stringBottom = new THREE.Mesh(stringGeoUp, stringMat);
  stringBottom.position.set(0, -BOW_TIP_Y, BOW_TIP_Z);
  bow.add(stringBottom);

  // The arrow on the string. Hidden until the hero starts a draw.
  // Pulled toward the archer (+Z) as the string is drawn; reach is small enough
  // that the fully-drawn string stops just short of the torso.
  const nockedArrow = buildArrow({ length: 0.66 });
  nockedArrow.rotation.y = Math.PI; // point it along -Z
  nockedArrow.position.set(0, 0, BOW_TIP_Z);
  nockedArrow.visible = false;
  bow.add(nockedArrow);

  if (accessory) accessory(bob, { hipY });

  root.scale.setScalar(scale);
  return {
    root,
    parts: {
      flip, bob, legL, legR, torso, head, aimPivot,
      bow, stringTop, stringBottom, nockedArrow,
      bowTips: { y: BOW_TIP_Y, z: BOW_TIP_Z },
      /** Kept for backwards compatibility with the old rig naming. */
      gun: bow,
    },
  };
}

/** Enemy variant of the character rig — squarer, angrier, with type-specific flair. */
export function createEnemyModel(type) {
  const rig = createCharacter({
    shirt: type.color,
    shirtDark: type.accent,
    pants: 0x2f2f38,
    skin: type.id === 'brute' ? 0xd98a5f : P.skin,
    hair: 0x1c1c22,
    scale: type.scale,
  });
  const { bob, head } = rig.parts;

  if (type.id === 'brute') {
    // Wide shoulders + horns so the tank reads instantly.
    for (const x of [-0.52, 0.52]) {
      const pad = box(0.26, 0.26, 0.4, 0x4a4a55);
      pad.position.set(x, 1.11, 0);
      add(bob, pad);
    }
    for (const x of [-0.16, 0.16]) {
      const horn = cone(0.09, 0.32, 0xe8e0cc, 5);
      horn.position.set(x, 1.3, 0);
      horn.rotation.z = x < 0 ? 0.32 : -0.32;
      add(bob, horn);
    }
    const chest = box(0.5, 0.24, 0.1, 0x2b2b33);
    chest.position.set(0, 1.14, -0.24);
    add(bob, chest);
  }

  if (type.id === 'runner') {
    // Hood + scarf, leaning forward for a skittish silhouette.
    const hood = cone(0.3, 0.4, type.accent, 6);
    hood.position.y = 1.42;
    add(bob, hood);
    const scarf = box(0.4, 0.1, 0.42, 0xd7dbe6);
    scarf.position.y = 1.06;
    add(bob, scarf);
    bob.rotation.x = -0.12;
  }

  if (type.id === 'grunt') {
    const helmet = box(0.5, 0.14, 0.5, 0x8a8f98);
    helmet.position.y = 1.36;
    add(bob, helmet);
    const spike = cone(0.06, 0.18, 0xc9ccd2, 4);
    spike.position.y = 1.52;
    add(bob, spike);
  }

  // Give enemies a crude melee weapon instead of a rifle.
  const { aimPivot } = rig.parts;
  for (const child of [...aimPivot.children]) {
    if (child.userData.isWeapon) aimPivot.remove(child);
  }
  const club = new THREE.Group();
  club.position.set(-0.2, -0.04, -0.5);
  club.userData.isWeapon = true;
  aimPivot.add(club);

  if (type.id === 'brute') {
    const haft = cyl(0.06, 0.06, 0.8, P.wood, 6);
    haft.rotation.x = Math.PI / 2;
    haft.position.z = -0.3;
    add(club, haft);
    const headBlock = box(0.34, 0.34, 0.34, 0x6e737c);
    headBlock.position.z = -0.72;
    add(club, headBlock);
  } else {
    const stick = cyl(0.05, 0.06, 0.62, P.wood, 6);
    stick.rotation.x = Math.PI / 2;
    stick.position.z = -0.24;
    add(club, stick);
  }

  head.rotation.y = 0;
  return rig;
}

/* ------------------------------------------------------------------ *
 * Castle keep
 * ------------------------------------------------------------------ */

export function createKeep() {
  const root = new THREE.Group();

  // Paved plaza the player circles around.
  //
  // Every top face sits at a *distinct* height, each ~0.03 above the one outside
  // it, and all of them clear of the world ground plane at y=0 and the mown
  // grass stripes at y=0.005.
  //
  // Two constraints pull against each other here, so the numbers matter:
  //   1. The steps must be tall enough to beat depth-buffer precision (~0.001
  //      units at this camera distance). Sharing a height — as an earlier
  //      version did, topping out at exactly y=0 — is coplanar with the terrain
  //      and z-fights, which is what produced the ring around the keep that
  //      flickered between sand and grass.
  //   2. They must stay low, because the hero and the besieging enemies stand on
  //      this plaza at y=0 and would visibly sink into a tall dais.
  // ~0.03 steps with an 0.08 total keeps both happy.
  const plazaKerb = cyl(6.0, 6.25, 0.05, P.dirtDark, 16);
  plazaKerb.position.y = -0.005; // spans -0.030 .. 0.020  (top 0.020)
  add(root, plazaKerb, { receive: true });

  const plaza = cyl(5.6, 6.0, 0.05, P.sand, 16);
  plaza.position.y = 0.02; // spans -0.005 .. 0.045  (top 0.045)
  add(root, plaza, { receive: true });

  const plazaTop = cyl(5.6, 5.6, 0.05, P.dirt, 16);
  plazaTop.position.y = 0.055; // spans  0.030 .. 0.080  (top 0.080)
  add(root, plazaTop, { receive: true });

  // Rocky foundation pad under the hall.
  const mound = cyl(4.3, 4.8, 0.7, P.rock, 12);
  mound.position.y = 0.3;
  add(root, mound, { receive: true });
  const moundTop = cyl(4.15, 4.3, 0.3, P.grass, 12);
  moundTop.position.y = 0.75;
  add(root, moundTop, { receive: true });

  // Stone curtain wall.
  const wallHeight = 1.5;
  const wall = cyl(3.5, 3.6, wallHeight, P.stone, 8);
  wall.position.y = 1.6;
  add(root, wall, { receive: true });

  // Battlement crenellations around the octagon.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const merlon = box(0.7, 0.55, 0.5, P.stone);
    merlon.position.set(Math.cos(a) * 3.45, 2.6, Math.sin(a) * 3.45);
    merlon.rotation.y = -a;
    add(root, merlon);
  }

  // Timber hall inside the walls.
  const hall = box(3.1, 2.1, 3.1, P.wood);
  hall.position.y = 3.3;
  add(root, hall);

  for (const y of [2.65, 3.35, 4.05]) {
    const band = box(3.2, 0.12, 3.2, P.woodDark);
    band.position.y = y;
    add(root, band);
  }

  // Pyramid roof.
  const roof = cone(2.65, 1.9, P.roofRed, 4);
  roof.position.y = 5.1;
  roof.rotation.y = Math.PI / 4;
  add(root, roof);

  // Banner pole.
  const pole = cyl(0.06, 0.06, 1.6, P.woodDark, 6);
  pole.position.y = 6.55;
  add(root, pole);
  const flag = box(0.7, 0.42, 0.06, P.roofBlue);
  flag.position.set(0.4, 7.0, 0);
  add(root, flag);

  // Door + windows.
  const door = box(0.9, 1.4, 0.18, P.woodDark);
  door.position.set(0, 2.25, -1.62);
  add(root, door);
  for (const x of [-1.1, 1.1]) {
    const win = box(0.5, 0.5, 0.14, 0x5a4630);
    win.position.set(x, 3.55, -1.6);
    add(root, win, { cast: false });
  }

  return root;
}

/* ------------------------------------------------------------------ *
 * Archer tower — a square stone tower with a shingled pyramid roof
 *
 * Modelled after the reference art: a stocky square tower of weathered stone,
 * split into a lower and an upper stage by a protruding cornice, with a big
 * arched window above and narrow arched slits below, an arched wooden door at
 * the foot, moss creeping up the shaded stonework, and a broad shingled pyramid
 * roof with overhanging eaves and a finial.
 *
 * It mounts no weapon — arrows are loosed out of the arched windows.
 * ------------------------------------------------------------------ */

export function createArcherTower(level = 1) {
  const root = new THREE.Group();

  /* Square plan. `HW` is the half-width of a face, which every part below is
   * measured against. Everything grows a little with the tier. */
  const HW = 0.9 + (level - 1) * 0.03;
  const PLINTH_TOP = 0.34;
  /** Lower stage: the deep, heavily-shadowed base of the reference. */
  const LOWER_TOP = 1.95 + (level - 1) * 0.12;
  /** Upper stage: carries the big arched window. */
  const UPPER_TOP = 3.32 + (level - 1) * 0.16;
  /** Vertical centre of the arched windows — also where arrows come from. */
  const WINDOW_CENTER = LOWER_TOP + 0.89;
  const FACE_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  /**
   * Builds an arched opening facing +Z, its base at y=0 and peak at y=`h`.
   * A box plus a half-buried cylinder of the same width reads as a proper round
   * arch and costs two meshes instead of modelling the curve.
   */
  const archedOpening = (w, h, depth, color) => {
    const g = new THREE.Group();
    const r = w / 2;

    const jamb = box(w, h - r, depth, color);
    jamb.position.y = (h - r) / 2;
    add(g, jamb, { cast: false });

    const arch = cyl(r, r, depth, color, 10);
    arch.rotation.x = Math.PI / 2;
    arch.position.y = h - r;
    add(g, arch, { cast: false });

    return g;
  };

  /** Seats a part on one of the four faces. Angle 0 faces +Z. */
  const onFace = (obj, angle, y, offset) => {
    obj.position.set(Math.sin(angle) * offset, y, Math.cos(angle) * offset);
    obj.rotation.y = angle;
    root.add(obj);
    return obj;
  };

  // --- Tumbled rubble around the foot ---------------------------------
  for (const [x, z, r, rot] of [
    [1.18, 0.42, 0.3, 0.6],
    [-0.95, 0.78, 0.26, -1.1],
    [0.5, 1.15, 0.28, 0.4],
    [-0.62, -0.98, 0.22, 1.9],
    [1.32, -0.5, 0.24, -0.5],
  ]) {
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(P.towerStoneDark));
    chunk.position.set(x, r * 0.55, z);
    chunk.rotation.set(rot, rot * 1.7, rot * 0.6);
    add(root, chunk, { receive: true });
  }

  // --- Plinth -----------------------------------------------------------
  const plinth = box(HW * 2 + 0.3, PLINTH_TOP, HW * 2 + 0.3, P.towerStoneDark);
  plinth.position.y = PLINTH_TOP / 2;
  add(root, plinth, { receive: true });

  const plinthCap = box(HW * 2 + 0.18, 0.1, HW * 2 + 0.18, P.towerStoneLight);
  plinthCap.position.y = PLINTH_TOP + 0.05;
  add(root, plinthCap, { receive: true });

  // --- Lower stage -------------------------------------------------------
  const lowerH = LOWER_TOP - PLINTH_TOP;
  const lower = box(HW * 2, lowerH, HW * 2, P.towerStone);
  lower.position.y = PLINTH_TOP + lowerH / 2;
  add(root, lower, { receive: true });

  // Stacked courses, sitting slightly proud of the wall. This banding is what
  // gives the reference its heavy, almost basket-like stonework.
  const COURSES = 4 + level;
  for (let i = 0; i < COURSES; i++) {
    const y = PLINTH_TOP + (lowerH / COURSES) * (i + 0.5);
    const course = box(HW * 2 + 0.1, 0.14, HW * 2 + 0.1, i % 2 ? P.towerStoneLight : P.towerStoneDark);
    course.position.y = y;
    add(root, course);
  }

  // --- Arched door at the foot, facing -Z --------------------------------
  const DOOR_ANGLE = Math.PI;
  const doorLeaf = archedOpening(0.5, 0.86, 0.12, P.doorWood);
  onFace(doorLeaf, DOOR_ANGLE, PLINTH_TOP + 0.05, HW - 0.16);

  // Stone surround, so the opening still reads as an arch cut into the wall.
  const surround = archedOpening(0.66, 1.06, 0.22, P.towerStoneLight);
  onFace(surround, DOOR_ANGLE, PLINTH_TOP + 0.02, HW - 0.06);

  const threshold = box(0.98, 0.12, 0.36, P.towerStoneLight);
  onFace(threshold, DOOR_ANGLE, PLINTH_TOP - 0.03, HW - 0.04);

  // --- Narrow arched slits through the lower stage ------------------------
  for (const angle of FACE_ANGLES) {
    for (const off of [-0.26, 0, 0.26]) {
      const slit = archedOpening(0.13, 0.62, 0.22, P.recess);
      slit.position.set(
        Math.sin(angle) * (HW - 0.01) + Math.cos(angle) * off,
        PLINTH_TOP + 0.68,
        Math.cos(angle) * (HW - 0.01) - Math.sin(angle) * off
      );
      slit.rotation.y = angle;
      add(root, slit);
    }
  }

  // --- Cornice dividing the two stages ------------------------------------
  const corniceUnder = box(HW * 2 + 0.24, 0.1, HW * 2 + 0.24, P.towerStoneDark);
  corniceUnder.position.y = LOWER_TOP - 0.03;
  add(root, corniceUnder);

  const cornice = box(HW * 2 + 0.34, 0.2, HW * 2 + 0.34, P.towerStoneLight);
  cornice.position.y = LOWER_TOP + 0.11;
  add(root, cornice, { receive: true });

  // --- Upper stage ---------------------------------------------------------
  const upperBase = LOWER_TOP + 0.21;
  const upperH = UPPER_TOP - upperBase;
  const upper = box(HW * 2 - 0.14, upperH, HW * 2 - 0.14, P.towerStone);
  upper.position.y = upperBase + upperH / 2;
  add(root, upper, { receive: true });

  const upperCourses = 2 + level;
  for (let i = 0; i < upperCourses; i++) {
    const y = upperBase + (upperH / upperCourses) * (i + 0.5);
    const course = box(HW * 2 - 0.04, 0.12, HW * 2 - 0.04, i % 2 ? P.towerStoneDark : P.towerStoneLight);
    course.position.y = y;
    add(root, course);
  }

  // --- Big arched window on every face of the upper stage -------------------
  for (const angle of FACE_ANGLES) {
    const win = archedOpening(0.7, 0.94, 0.24, P.recess);
    onFace(win, angle, WINDOW_CENTER - 0.47, HW - 0.1);

    const sill = box(0.86, 0.1, 0.28, P.towerStoneLight);
    onFace(sill, angle, WINDOW_CENTER - 0.52, HW - 0.08);
  }

  // --- Moss creeping up the shaded stonework --------------------------------
  // Flat patches break up the plain faces and sell the damp, weathered look.
  for (const [angle, y, w, h, off] of [
    [0.3, PLINTH_TOP + 0.24, 0.5, 0.3, 0.2],
    [Math.PI - 0.4, PLINTH_TOP + 0.72, 0.34, 0.5, -0.25],
    [Math.PI / 2 + 0.25, PLINTH_TOP + 0.36, 0.44, 0.26, 0.1],
    [-Math.PI / 2 - 0.3, PLINTH_TOP + 0.56, 0.3, 0.44, 0.28],
    [1.2, PLINTH_TOP + 1.18, 0.28, 0.36, -0.15],
  ]) {
    const patch = box(w, h, 0.05, P.moss);
    patch.position.set(
      Math.sin(angle) * (HW + 0.02) + Math.cos(angle) * off,
      y,
      Math.cos(angle) * (HW + 0.02) - Math.sin(angle) * off
    );
    patch.rotation.y = angle;
    add(root, patch, { cast: false });
  }

  // --- Overhanging roof cornice ------------------------------------------
  const ROOF_BASE_W = HW * 2 + 0.94;

  const roofCorniceUnder = box(HW * 2 + 0.14, 0.12, HW * 2 + 0.14, P.towerStoneDark);
  roofCorniceUnder.position.y = UPPER_TOP - 0.04;
  add(root, roofCorniceUnder);

  const roofCornice = box(ROOF_BASE_W, 0.22, ROOF_BASE_W, P.towerStoneLight);
  roofCornice.position.y = UPPER_TOP + 0.11;
  add(root, roofCornice, { receive: true });

  // --- Shingled pyramid roof ----------------------------------------------
  // A 4-sided cone, rotated 45° so its flat faces line up with the tower's
  // walls. The base runs well past the cornice, which is what gives the
  // reference its broad overhanging eaves.
  const eaveY = UPPER_TOP + 0.2;
  const ROOF_H = 1.28 + (level - 1) * 0.06;
  const ROOF_R = (ROOF_BASE_W / 2) * Math.SQRT2; // circumradius of the square base

  const roof = cone(ROOF_R, ROOF_H, P.towerRoof, 4);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = eaveY + ROOF_H / 2;
  add(root, roof);

  // A second, narrower cone registers the layered shingle courses of the
  // reference without needing real tile geometry.
  const roofUpperH = ROOF_H * 0.5;
  const roofUpper = cone(ROOF_R * 0.6, roofUpperH, P.towerRoofDark, 4);
  roofUpper.rotation.y = Math.PI / 4;
  roofUpper.position.y = eaveY + ROOF_H * 0.6;
  add(root, roofUpper);

  const apexY = eaveY + ROOF_H;
  const finial = sphere(0.1, P.towerStoneLight);
  finial.position.y = apexY + 0.05;
  add(root, finial);

  // --- Tier trim: taller stonework is the main tell, plus carved bands -------
  if (level >= 2) {
    const band = box(HW * 2 - 0.02, 0.12, HW * 2 - 0.02, P.towerStoneLight);
    band.position.y = UPPER_TOP - 0.26;
    add(root, band);
  }
  if (level >= 3) {
    const eaves = box(ROOF_BASE_W + 0.16, 0.1, ROOF_BASE_W + 0.16, P.towerStoneDark);
    eaves.position.y = eaveY - 0.02;
    add(root, eaves);
  }

  /*
   * Invisible aiming rig.
   *
   * There is deliberately no weapon on this tower — it is masonry, and arrows
   * are loosed straight out of the arched windows. The tower still needs
   * somewhere to aim *from* and *along*, so the yaw/pitch groups and the muzzle
   * anchor are kept as pure transforms with no meshes attached. The firing code
   * never has to know the difference.
   *
   * As with the character rig, `turretRoot` carries a 180° flip because the
   * aiming code drives `yaw.rotation.y = Math.atan2(dx, dz)` (+Z convention).
   */
  const turretRoot = new THREE.Group();
  turretRoot.position.y = WINDOW_CENTER;
  turretRoot.rotation.y = Math.PI;
  root.add(turretRoot);

  const yaw = new THREE.Group();
  turretRoot.add(yaw);

  // Pure rotation pivot: the pitch must not drag the muzzle up and down out of
  // the window, so the muzzle hangs off `yaw` and only the *direction* pitches.
  const pitch = new THREE.Group();
  yaw.add(pitch);

  /** Where arrows emerge: just outside the arched window facing the target. */
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -1.02);
  yaw.add(muzzle);

  return {
    root,
    parts: {
      yaw,
      pitch,
      muzzle,
      /**
       * Height of the aim pivot above the tower's base. The model answers this
       * itself so the aiming code never hard-codes a number that shifts with the
       * tier — the whole tower grows as it is upgraded.
       */
      turretHeight: turretRoot.position.y,
      /** Where to float the health bar: clear of the roof. */
      badgeHeight: apexY + 0.5,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Props
 * ------------------------------------------------------------------ */

export function createCoin() {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.07, 12),
    new THREE.MeshStandardMaterial({
      color: P.gold,
      roughness: 0.28,
      metalness: 0.75,
      emissive: new THREE.Color(P.goldDark),
      emissiveIntensity: 0.55,
    })
  );
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  group.add(disc);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.09, 10),
    new THREE.MeshStandardMaterial({ color: P.goldLight, roughness: 0.3, metalness: 0.8 })
  );
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.005;
  group.add(inner);

  return group;
}

export function createTree(rng) {
  const root = new THREE.Group();
  const trunk = cyl(0.16, 0.22, 0.9, P.woodDark, 6);
  trunk.position.y = 0.45;
  add(root, trunk);

  const blobs = 2 + Math.floor(rng() * 2);
  const foliage = new THREE.Group();
  for (let i = 0; i < blobs; i++) {
    const r = 0.7 - i * 0.16;
    const leaf = cone(r + 0.2, 1.1, i % 2 ? P.grassDark : 0x3f8a2c, 6);
    leaf.position.y = 1.15 + i * 0.5;
    leaf.rotation.y = rng() * Math.PI;
    add(foliage, leaf);
  }
  root.add(foliage);

  const s = 0.85 + rng() * 0.5;
  root.scale.setScalar(s);
  root.rotation.y = rng() * Math.PI * 2;

  // Exposed so the chopping code can sway the canopy independently.
  root.userData.foliage = foliage;
  return root;
}

/** What's left of a tree after the hero has chopped it down. */
export function createStump() {
  const root = new THREE.Group();

  const base = cyl(0.24, 0.3, 0.22, P.woodDark, 7);
  base.position.y = 0.11;
  add(root, base, { receive: true });

  // Pale cut face.
  const cut = cyl(0.21, 0.21, 0.05, 0xd8b071, 7);
  cut.position.y = 0.24;
  add(root, cut, { cast: false });

  // A couple of wood chips scattered around the base.
  for (const [x, z, rot] of [
    [0.42, 0.18, 0.6],
    [-0.3, -0.35, -0.9],
    [0.1, 0.46, 1.8],
  ]) {
    const chip = box(0.3, 0.05, 0.1, P.plank);
    chip.position.set(x, 0.04, z);
    chip.rotation.y = rot;
    add(root, chip, { cast: false });
  }

  return root;
}

export function createRock(rng) {
  const root = new THREE.Group();
  const count = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const r = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.35 + rng() * 0.35, 0),
      mat(rng() > 0.5 ? P.rock : P.rockDark)
    );
    r.position.set((rng() - 0.5) * 0.7, r.geometry.parameters.radius * 0.6, (rng() - 0.5) * 0.7);
    r.rotation.set(rng(), rng(), rng());
    add(root, r, { receive: true });
  }
  return root;
}

export function createBush(rng) {
  const root = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = sphere(0.22 + rng() * 0.14, rng() > 0.5 ? P.grassDark : 0x44962f);
    b.position.set((rng() - 0.5) * 0.5, 0.2, (rng() - 0.5) * 0.5);
    add(root, b, { cast: false });
  }
  return root;
}

export function createHouse(roofColor = P.roofRed) {
  const root = new THREE.Group();
  const bodyMesh = box(2.0, 1.4, 1.7, P.plank);
  bodyMesh.position.y = 0.7;
  add(root, bodyMesh, { receive: true });

  const roof = cone(1.75, 1.05, roofColor, 4);
  roof.position.y = 1.9;
  roof.rotation.y = Math.PI / 4;
  add(root, roof);

  const door = box(0.5, 0.85, 0.1, P.woodDark);
  door.position.set(0, 0.45, -0.88);
  add(root, door, { cast: false });

  for (const x of [-0.6, 0.6]) {
    const win = box(0.36, 0.36, 0.1, 0x6b8fb5);
    win.position.set(x, 0.9, -0.88);
    add(root, win, { cast: false });
  }

  const chimney = box(0.3, 0.6, 0.3, P.stone);
  chimney.position.set(0.6, 1.6, 0.4);
  add(root, chimney);
  return root;
}

export function createFence(length = 6, color = P.woodDark) {
  const root = new THREE.Group();
  for (let x = 0; x <= length; x += 1) {
    const post = box(0.14, 0.75, 0.14, color);
    post.position.set(x - length / 2, 0.37, 0);
    add(root, post);
  }
  for (const y of [0.25, 0.55]) {
    const rail = box(length + 0.3, 0.1, 0.08, P.wood);
    rail.position.set(0, y, 0);
    add(root, rail);
  }
  return root;
}
