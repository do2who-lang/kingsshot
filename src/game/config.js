/**
 * Central balance + art-direction config.
 * Tweak numbers here; nothing else needs to change.
 */

/** Stylized low-poly palette, lifted from the reference art (chunky greens + warm dirt). */
export const PALETTE = {
  grass: 0x63b845,
  grassDark: 0x4e9a35,
  grassLight: 0x77c957,
  dirt: 0xc7a06b,
  dirtDark: 0xac8552,
  sand: 0xdccfa8,
  rock: 0xbdb2a0,
  rockDark: 0x9d9382,
  water: 0x9fd8e8,

  wood: 0x8a5a2b,
  woodDark: 0x6a4320,
  woodLight: 0xa9703a,
  roofRed: 0xc0392b,
  roofBlue: 0x3f7fc4,
  plank: 0xd8b071,
  wall: 0xefe3c8,
  stone: 0xb9b0a0,
  stoneLight: 0xcfc6b4,
  stoneDark: 0x9d9382,
  /** Warm shingled roofing, straight off the reference watchtower. */
  shingle: 0xd2ab74,
  shingleDark: 0xb08a58,
  /** The near-black inside of a window or doorway opening. */
  recess: 0x241f19,

  /*
   * The archer tower has its own, darker palette so it reads as a distinct
   * structure from the keep's warm timber and the pale field stone.
   */
  towerStone: 0x8d877c,
  towerStoneLight: 0xaaa398,
  towerStoneDark: 0x6f6a61,
  /** Weathered shingles: reads equally as wood shakes or slate. */
  towerRoof: 0x7d8474,
  towerRoofDark: 0x626a5b,
  /** Damp green growth creeping up the shaded stonework. */
  moss: 0x5f7a3a,
  /** The arched door at the foot. */
  doorWood: 0x6b4a2a,

  gold: 0xf5c518,
  goldDark: 0xc79a10,
  goldLight: 0xffe27a,

  player: 0x2f6fd0,
  playerDark: 0x1f4f9c,
  skin: 0xf2c9a0,
  enemyRed: 0xd0392c,
  enemyRedDark: 0x9c2a20,
  enemyOrange: 0xe8862b,
  enemyOrangeDark: 0xb26318,
  enemyPurple: 0x8e44ad,
  enemyPurpleDark: 0x663183,

  muzzle: 0xffe9a3,
  blood: 0xff5a3c,
};

/** World / map constants. Units are metres. */
export const WORLD = {
  /** Half-extent of the playable square: map spans [-SIZE, SIZE] on X and Z. */
  size: 34,
  /** Keep footprint radius — enemies stop here. */
  keepRadius: 3.2,
  /** Where enemies spawn, as a ring radius from the keep. */
  spawnRadius: 31,
  /** Player speed in units/second. */
  playerSpeed: 7.4,
};

/** The player hero. */
export const HERO = {
  maxHealth: 100,
  /** Seconds before health starts regenerating out of combat. */
  regenDelay: 4,
  regenPerSecond: 8,
  /** Kills top the hero up a little, so aggression pays off. */
  healPerKill: 3,

  weapon: {
    name: 'Longbow',
    damage: 26,
    /** Arrows per second. Slow, heavy, and accurate — not a machine gun. */
    fireRate: 1.45,
    /** Auto-target acquisition radius. */
    range: 17,
    /** 0 = perfectly accurate, 1 = very loose aim. Bows are precise here. */
    spread: 0.012,
    arrowSpeed: 54,
    /** Cone half-angle (degrees) used to pick a target ahead of the hero. */
    aimAssist: 50,
    /** Seconds spent nocking + drawing before the shot releases. */
    drawTime: 0.34,
  },

  /** Walk-over pickup radius for coins. */
  pickupRadius: 1.5,
  /** Horizontal distance from a coin at which it starts flying to the hero. */
  magnetRadius: 4,
};

/**
 * Archer towers. Cost is deducted from the coin purse on build.
 * `pads` each hold exactly one tower.
 *
 * Towers are living structures: they have health, enemies besiege them, and the
 * hero patches them up with wood. A tower reduced to zero collapses into rubble
 * and its pad can be rebuilt at a discount.
 */
export const TOWER = {
  buildCost: 40,
  /** Each subsequent tower costs this much more. */
  costStep: 20,
  maxLevel: 3,
  /** Cost multiplier applied to the base cost per upgrade level. */
  upgradeCostScale: [1, 1.6, 2.4],

  /**
   * Collision radius enemies stop at when besieging a tower. Larger than the
   * old timber deck because the stone tower has a much wider footprint.
   */
  blockRadius: 1.7,
  /** Seconds the collapse animation runs before rubble settles. */
  collapseTime: 1.3,
  /**
   * Enemies are hacking at timber, not masonry, so they chip towers slowly.
   * Without this a pair of grunts would level a tower before the hero could
   * cross the map to defend it.
   */
  damageTakenScale: 0.6,

  levels: [
    { damage: 15, fireRate: 0.85, range: 11.5, projectileSpeed: 42, maxHealth: 140 },
    { damage: 24, fireRate: 1.05, range: 13.0, projectileSpeed: 46, maxHealth: 210 },
    { damage: 36, fireRate: 1.25, range: 14.5, projectileSpeed: 52, maxHealth: 300 },
  ],
};

/**
 * Enemy archetypes. Three flavours with clearly different answers:
 *  - grunt  : cheap fodder, arrives in packs
 *  - brute  : slow tank, soaks damage, hits the keep hard
 *  - runner : fast flanker, races past defences straight to the keep
 */
export const ENEMY_TYPES = {
  grunt: {
    id: 'grunt',
    name: 'Grunt',
    color: PALETTE.enemyOrange,
    accent: PALETTE.enemyOrangeDark,
    scale: 0.92,
    maxHealth: 34,
    speed: 2.9,
    damage: 6,
    attackRate: 0.95,
    attackRange: 1.9,
    bounty: { count: 3, value: 2 }, // 6 coins total
    threat: 1,
  },
  brute: {
    id: 'brute',
    name: 'Brute',
    color: PALETTE.enemyRed,
    accent: PALETTE.enemyRedDark,
    scale: 1.35,
    maxHealth: 145,
    speed: 1.65,
    damage: 20,
    attackRate: 0.75,
    attackRange: 2.4,
    bounty: { count: 6, value: 3 }, // 18 coins total
    threat: 3,
  },
  runner: {
    id: 'runner',
    name: 'Runner',
    color: PALETTE.enemyPurple,
    accent: PALETTE.enemyPurpleDark,
    scale: 0.82,
    maxHealth: 46,
    speed: 5.0,
    damage: 10,
    attackRate: 1.6,
    attackRange: 1.8,
    bounty: { count: 4, value: 2 }, // 8 coins total
    threat: 2,
  },
};

export const KEEP = {
  maxHealth: 100,
  /** Spawns one free coin every N seconds so the player is never hard-stuck. */
  incomeInterval: 9,
  incomeAmount: 4,
};

/**
 * Trees are a second, renewable resource. When the keep is hurt the hero has
 * to leave its cover to go chop, which is the whole tension of the mechanic.
 */
export const TREE = {
  /** Chops needed to fell a tree. Each chop yields `woodPerChop`. */
  chops: 3,
  woodPerChop: 1,
  /** Seconds before a felled tree regrows on the same spot. */
  respawnTime: 30,
  /** How close the hero must stand to chop. */
  interactRange: 3.0,
  /** Animation timings. */
  shakeTime: 0.22,
  fallTime: 1.2,
  /** Sink the stump a touch so it reads as cut, not buried. */
  stumpHeight: 0.22,
};

/**
 * Repairing with wood. Coins build things; wood mends them. Keeping that split
 * means the player always knows which resource answers which problem.
 */
export const REPAIR = {
  /** Wood spent per repair action (both the keep and towers). */
  woodCost: 1,
  /** Keep health restored per repair action. */
  healAmount: 12,
  /** How close the hero must stand to the keep to repair it (keep blocks at 5.3). */
  range: 9.0,

  /** Tower health restored per repair action — towers are smaller than a keep. */
  towerHealAmount: 45,
  /** How close the hero must stand to a tower to repair it. */
  towerRange: 3.6,
  /** Rebuilding a collapsed tower costs this fraction of a fresh one. */
  rebuildDiscount: 0.5,
};

/**
 * Wave table. Each entry describes a single wave; `budget` is spent on
 * enemies by threat cost, so later waves naturally mix archetypes.
 * After the table runs out, waves are generated procedurally.
 */
export const WAVES = [
  { budget: 3, pool: ['grunt'], spawnGap: 1.4, prepTime: 8 },
  { budget: 5, pool: ['grunt'], spawnGap: 1.1, prepTime: 8 },
  { budget: 7, pool: ['grunt', 'runner'], spawnGap: 1.0, prepTime: 7 },
  { budget: 10, pool: ['grunt', 'runner', 'brute'], spawnGap: 0.95, prepTime: 7 },
  { budget: 14, pool: ['grunt', 'runner', 'brute'], spawnGap: 0.85, prepTime: 6 },
  { budget: 19, pool: ['grunt', 'runner', 'brute'], spawnGap: 0.75, prepTime: 6 },
  { budget: 25, pool: ['grunt', 'runner', 'brute'], spawnGap: 0.68, prepTime: 6 },
  { budget: 33, pool: ['grunt', 'runner', 'brute'], spawnGap: 0.6, prepTime: 5 },
];

/** Procedural wave generation once WAVES is exhausted. */
export function generateWave(waveNumber) {
  const n = waveNumber - WAVES.length; // 1, 2, 3...
  return {
    budget: Math.round(33 + n * 9 + n * n * 1.6),
    pool: ['grunt', 'runner', 'brute'],
    spawnGap: Math.max(0.34, 0.6 - n * 0.035),
    prepTime: Math.max(4, 5 - n * 0.3),
    healthScale: 1 + n * 0.14,
    speedScale: 1 + n * 0.03,
  };
}

/** Camera rig, tuned for the reference's slightly-tilted top-down "semi-3D" view. */
export const CAMERA = {
  fov: 38,
  /** Offset from the follow target. */
  offset: { x: 0, y: 30, z: 26 },
  /** How far the camera leads the hero in the direction of travel. */
  lead: 3.2,
  followLerp: 4.5,
  /** Camera never leaves this box, so the map edges stay framed. */
  clamp: 15,
};

export const RENDER = {
  shadowMapSize: 2048,
  /**
   * The camera is pitched far enough down that the ground fills the whole
   * frame, so the fog only exists to swallow the far edge of the plane.
   * Keeping `fogNear` beyond the visible range (≈60 units) means the play
   * area never looks washed out.
   */
  fogNear: 95,
  fogFar: 260,
  fogColor: 0xcfe9d8,
  skyColor: 0xa9d8ef,
};
