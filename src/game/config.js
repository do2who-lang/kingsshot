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

  /*
   * The stone quarry. Cool, blue-grey granite so it reads as a different
   * material from the keep's warm timber and the tower's pale field stone, plus
   * the split stone that is the game's third resource.
   */
  quarryRock: 0x8a929c,
  quarryRockLight: 0xaab2bc,
  quarryRockDark: 0x6b727b,
  gravel: 0x9c9585,
  gravelDark: 0x7c7566,
  /** Cut-block resource colour: the HUD stone chip + floating numbers. */
  stoneRes: 0xc2cbd6,

  /*
   * The perimeter wall: rougher, cooler fieldstone than the tower's dressed
   * ashlar, so a rampart reads as a different build at a glance.
   */
  wallStone: 0x938d80,
  wallStoneLight: 0xada797,
  wallStoneDark: 0x716b5e,
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

/**
 * Free-placement rules. Structures are no longer tied to fixed pads: the hero
 * may raise one anywhere that is clear, so these are the only constraints.
 */
export const BUILD = {
  /** Nothing may be raised inside this radius of the keep's plaza. */
  keepClearance: 7.8,
  /** Minimum gap between two structures' footprints. */
  spacing: 1.3,
  /** How far inside the map edge a structure may sit. */
  edgeMargin: 5.0,
  /** How close the hero must stand to upgrade or repair a structure. */
  interactRange: 3.8,
  /** Ghost preview tints. */
  validTint: 0x7dff8a,
  invalidTint: 0xff6b6b,
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
 *
 * Raising a tower also costs **stone**, which is cut at the quarry. Coins pay
 * for the timber and labour; stone is the actual masonry, and without it there
 * is nothing to build a tower out of.
 */
export const TOWER = {
  name: 'Archer Tower',
  buildCost: 40,
  /** Stone blocks needed on top of the coins for a brand-new tower. */
  stoneCost: 6,
  /** Each subsequent tower costs this much more (coins and stone). */
  costStep: 20,
  stoneStep: 2,
  maxLevel: 3,
  /** Cost multiplier applied to the base cost per upgrade level. */
  upgradeCostScale: [1, 1.6, 2.4],
  /**
   * Stone per upgrade, indexed by the tower's *current* level (so a level-1
   * tower costs `upgradeStone[1]` stone to reach level 2).
   */
  upgradeStone: [0, 8, 14],

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
 * Stone — the third resource, and the one that gates real construction.
 *
 * Coins are looted from the fallen and wood is chopped from the forest, but
 * **stone can only be cut at a quarry the player raises**. Towers cost stone to
 * raise and upgrade, and every repair costs a little stone as well, so a run
 * with no quarry quickly runs out of the means to build or mend anything.
 */
export const STONE = {
  /** Stone in hand at the start of a run. Zero: the quarry is the only source. */
  starting: 0,
};

/**
 * The stone quarry: a working open-cast pit cut into the map.
 *
 * Unlike a tower it mounts no weapon — it is an *economy* building. It drip-
 * feeds stone while it stands, and like every structure it has health, can be
 * besieged, and is mended with wood.
 *
 * It deliberately costs **coins only**. Stone cannot buy the mine that produces
 * stone, so a run can never be locked out of its own resource.
 */
export const QUARRY = {
  name: 'Stone Quarry',
  /** Coins to open the pit. No stone — this is where stone comes from. */
  buildCost: 30,
  /** Each subsequent quarry costs this much more. */
  costStep: 15,
  maxLevel: 3,
  upgradeCostScale: [1, 1.5, 2.2],

  /** Collision radius enemies stop at when besieging the quarry. */
  blockRadius: 1.6,
  collapseTime: 1.3,
  /** Same timber-not-masonry reduction towers enjoy. */
  damageTakenScale: 0.6,

  /**
   * Per-tier output. A quarry yields `stonePerYield` stone every
   * `yieldInterval` seconds, so upgrading buys both a bigger stockpile and a
   * faster trickle. Level 1 pays roughly one stone every three seconds.
   */
  levels: [
    { maxHealth: 130, stonePerYield: 2, yieldInterval: 6.5 },
    { maxHealth: 190, stonePerYield: 3, yieldInterval: 5.0 },
    { maxHealth: 260, stonePerYield: 5, yieldInterval: 4.0 },
  ],
};

/**
 * The perimeter wall — the one structure that *connects*.
 *
 * Pieces snap to a shared grid and each rebuilds its own shape from whichever
 * neighbours exist, so the player can lay a continuous rampart around the keep
 * one piece at a time (straights, corners, T-junctions and ends all emerge from
 * the neighbour mask).
 *
 * Every piece is a real structure with its own health: enemies batter the wall
 * instead of walking to the keep, and the hero mends it with wood + stone.
 * Walls are cheap and do not upgrade — their value is in numbers and coverage.
 */
export const WALL = {
  name: 'Stone Wall',
  /** Flat price — a wall you must buy twenty of can't escalate per piece. */
  buildCost: 12,
  stoneCost: 3,
  /** Grid pitch. Pieces snap to multiples of this, centred on the world origin. */
  cell: 3.4,
  /**
   * Collision/aggro radius for one piece. Half the cell means neighbouring
   * pieces' circles overlap, so a wall line is a continuous barrier to the hero
   * and one long siege target to the horde.
   */
  blockRadius: 1.7,
  /** Nothing may be raised closer to the keep centre than this (plus radius). */
  keepClearance: 5.0,
  collapseTime: 1.1,
  /** Fieldstone, not timber — enemies chip it, but slower than a tower. */
  damageTakenScale: 0.7,
  maxHealth: 160,
  /** Wall profile, also consumed by the model builder. */
  thickness: 0.6,
  height: 1.95,
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
 * Repairing. Wood is the patch, stone is the filler: every mend costs a little
 * of each, so a player who has run dry of quarry stone can't patch a breach
 * either. Keeping the split (coins build, wood + stone mend) means the player
 * always knows which resource answers which problem.
 */
export const REPAIR = {
  /** Wood spent per repair action (the keep, towers and quarries alike). */
  woodCost: 1,
  /** Stone spent per repair action, on top of the wood. */
  stoneCost: 2,
  /** Keep health restored per repair action. */
  healAmount: 12,
  /** How close the hero must stand to the keep to repair it (keep blocks at 5.3). */
  range: 9.0,

  /** Structure health restored per repair action — smaller than a keep. */
  towerHealAmount: 45,
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
