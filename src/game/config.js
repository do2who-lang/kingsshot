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

  /*
   * The bombard. Dark iron ordnance on warm timber, so the gun reads as a
   * different beast from the pale stone of the archer tower.
   */
  bombardIron: 0x4d5560,
  bombardIronLight: 0x6a7480,
  bombardIronDark: 0x333941,

  /*
   * The catapult. Heavy timber it already shares with the keep and bombard; the
   * only new colour is the pale cordage of its torsion bundle.
   */
  rope: 0xc9b184,
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
  /** How far inside the map edge the hero is clamped. */
  heroClampPad: 3.5,
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
  /** Extra berth kept from trees and scenery when siting a structure. */
  treePad: 0.3,
  colliderPad: 0.3,
  /** Extra berth the hero keeps from a structure's footprint. */
  heroBerth: 0.3,
  /** Ghost preview pulse: opacity = base + sin(now / rate) * amp. */
  ghostPulse: { base: 0.35, amp: 0.12, rate: 150 },
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
 * The bombard — a stone-throwing mortar.
 *
 * The archer tower picks off single targets; the bombard answers the *swarm*.
 * It lobs a heavy shell in a high arc and bursts it over a radius, so a packed
 * push can be cleared in one shot. The price is its slow reload and a **dead
 * zone**: the barrel cannot depress, so anything that closes inside `minRange`
 * is safe from it. Towers hold the line; the bombard thins it on the way in.
 */
export const BOMBARD = {
  name: 'Bombard',
  buildCost: 55,
  /** Stone blocks on top of the coins for a brand-new bombard. */
  stoneCost: 10,
  /** Each subsequent bombard costs this much more (coins and stone). */
  costStep: 25,
  stoneStep: 3,
  maxLevel: 3,
  upgradeCostScale: [1, 1.7, 2.5],
  /** Stone per upgrade, indexed by the bombard's *current* level. */
  upgradeStone: [0, 10, 18],

  /** Collision radius enemies stop at when besieging it. */
  blockRadius: 1.8,
  collapseTime: 1.3,
  /** Field stone and iron: enemies chip it at the same rate as a tower. */
  damageTakenScale: 0.6,

  levels: [
    { damage: 24, reload: 3.4, range: 14.5, minRange: 4.0, blastRadius: 3.2, shellTime: 1.05, maxHealth: 150 },
    { damage: 36, reload: 3.0, range: 16.0, minRange: 4.0, blastRadius: 3.6, shellTime: 1.00, maxHealth: 220 },
    { damage: 52, reload: 2.6, range: 17.5, minRange: 3.8, blastRadius: 4.1, shellTime: 0.95, maxHealth: 310 },
  ],
};

/**
 * The catapult — a rolling-boulder siege engine.
 *
 * Where the bombard bursts a wide radius from a short, steep lob, the catapult
 * is the *line* weapon: it throws a boulder on a long arc, smashes whatever sits
 * at the landing point, and then the boulder keeps rolling on through the rank,
 * crushing everything in its path. Against a column funnelled down a lane it is
 * devastating; against a wide, scattered push it under-performs.
 *
 * It has no dead zone — it can't be rushed the way a bombard can — but its
 * reload is the slowest of any structure, so each shot has to count.
 */
export const CATAPULT = {
  name: 'Catapult',
  buildCost: 65,
  /** Stone blocks on top of the coins for a brand-new catapult. */
  stoneCost: 12,
  /** Each subsequent catapult costs this much more (coins and stone). */
  costStep: 30,
  stoneStep: 4,
  maxLevel: 3,
  upgradeCostScale: [1, 1.7, 2.5],
  /** Stone per upgrade, indexed by the catapult's *current* level. */
  upgradeStone: [0, 12, 20],

  /** Compact footprint — it shrank, so it takes less room than it used to. */
  blockRadius: 1.8,
  collapseTime: 1.3,
  /** Heavy timber frame: enemies chip it at the same rate as a tower. */
  damageTakenScale: 0.6,

  levels: [
    {
      damage: 31,       // burst damage at the landing point
      impactRadius: 2.6,
      rollDamage: 21,   // damage to each enemy the boulder crushes while rolling
      rollDistance: 9,  // how far past the impact it keeps rolling
      rollSpeed: 9,
      reload: 4.4,
      range: 17.0,
      shellTime: 1.15,
      maxHealth: 170,
    },
    {
      damage: 43,
      impactRadius: 2.9,
      rollDamage: 29,
      rollDistance: 11,
      rollSpeed: 10,
      reload: 4.0,
      range: 18.5,
      shellTime: 1.10,
      maxHealth: 240,
    },
    {
      damage: 59,
      impactRadius: 3.2,
      rollDamage: 39,
      rollDistance: 13,
      rollSpeed: 11,
      reload: 3.6,
      range: 20.0,
      shellTime: 1.05,
      maxHealth: 330,
    },
  ],
};

/**
 * Coins — the build currency. Looted from the fallen and spent on structures.
 * `starting` is the war chest a run opens with; raise it to give the player a
 * head start (build costs in TOWER/BOMBARD/CATAPULT above give a sense of
 * scale).
 */
export const COINS = {
  /** Coins in hand at the start of a run. */
  starting: 10000,
};

/**
 * Wood — chopped from the forest and spent on repairs, alongside stone. Like
 * coins, a run starts empty so the forest has a reason to matter.
 */
export const WOOD = {
  /** Wood in hand at the start of a run. */
  starting: 0,
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
  /**
   * Enemies chip the keep rather than shattering it, the same way they chip
   * towers, quarries and walls. Without this a single rush of grunts lands the
   * full 6 damage a swing and levels the castle before the hero can respond.
   * Well below the structures' 0.6/0.7 — the keep is the last line, so it soaks
   * far more than an open building does.
   */
  damageTakenScale: 0.35,
  /**
   * Seconds for the castle to come down once it is destroyed. Long enough that
   * the defeat camera has something to watch, short enough not to drag.
   */
  collapseTime: 2.6,
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

/* ==================================================================== *
 * FEEL / BEHAVIOUR
 *
 * Everything below is still pure tuning data — no logic. It is grouped by
 * the system it drives so the whole game can be rebalanced from this file.
 * ==================================================================== */

/**
 * Enemy AI. These are the numbers that decide how a wave *behaves*: when an
 * enemy diverts to a structure, how tightly the horde clumps, and where it
 * rings the keep.
 */
export const AI = {
  /** Seconds the red hit-flash lasts. */
  hitFlashTime: 0.12,
  /** Seconds the death animation plays before the corpse is recycled. */
  deathTime: 0.6,
  /** Initial attack delay is randomised over 0..this, so a group doesn't swing in unison. */
  attackStagger: 0.4,

  /** Projectile hit-sphere radius, as a multiple of the enemy's `scale`. */
  hitRadiusScale: 0.65,
  /** Height of the hit centre and health bar, per unit of `scale`. */
  headHeightScale: 1.15,
  /** Health bar sits this far above the head. */
  healthBarOffset: 0.75,
  /** Hit-sphere centre, as a fraction of head height. */
  hitCentreFactor: 0.78,

  /** Where along the keep's ring an enemy wants to stand: angle jitter. */
  laneAngle: 0.45,
  /** …and radial jitter. */
  laneRadius: 1.6,
  /** Multiplier turning lane angle → formation arc. */
  formationAngle: 2.2,
  /** Ring radius = keep.attackRadius + this. */
  formationRadiusPad: 0.4,
  /** How much the radial jitter tightens the ring. */
  formationTighten: 0.6,

  /** Enemy stops at `attackRange * siegeStopFactor + blockRadius` from a structure. */
  siegeStopFactor: 0.7,
  /**
   * How far off a structure's doorstep an enemy notices it and diverts.
   * The single biggest lever on "do towers get attacked".
   */
  siegeReach: 5.5,
  /** Extra slack that keeps an enemy committed to the structure it already picked. */
  commitSlack: 2.5,
  /** Distance at which an enemy will divert to the hero instead. */
  aggroHeroRange: 5.5,
  /** Extra reach on top of attackRange when hitting the hero. */
  heroRangePad: 0.8,
  /** Extra reach on top of keep.attackRadius when hitting the keep. */
  keepRangePad: 0.6,

  /** Separation force that keeps the horde from forming one conga line. */
  separationRadius: 1.05,
  separationPush: 1.6,
  /** Hard clamp keeping enemies on the map. */
  mapLimit: 42,

  /** Enemy health-bar colour bands (fraction of max). */
  barGood: 0.6,
  barWarn: 0.3,
};

/**
 * Spawning. Wave *content* lives in WAVES; this is the cadence and the extra
 * per-spawn behaviour around it.
 */
export const SPAWN = {
  /** Seconds after a wave begins before the first enemy appears. */
  initialDelay: 0.2,
  /** Chance a spawn is biased toward the heaviest affordable unit. */
  heavyBias: 0.45,
  /** Fallback gap between spawns when a wave config omits one. */
  defaultGap: 0.8,
  /** Chance two enemies are sent down the same gate back to back. */
  gateDoubleUp: 0.18,
  /** Per-spawn positional jitter (units, either side of the gate). */
  jitter: 3,
  /** Extra preparation time before the first wave. */
  firstPrep: 10,
  /** Countdown callouts are shown for the last N seconds of prep. */
  countdownFrom: 3,
  countdownCallout: 0.9,
  waveStartCallout: 2.0,
  introCallout: 2.2,
  /** Spawn puff. */
  burst: { count: 6, color: 0xcbb894, speed: 3, size: 0.2, life: 0.6, gravity: 10 },
};

/**
 * Effects. The caps are a performance budget; the named entries are the
 * standard bursts used by specific events, so an effect can be retuned without
 * hunting through the code that fires it.
 */
export const FX = {
  /** Hard ceiling on live particles. */
  maxItems: 320,
  /** Above this, new bursts are thinned to keep the frame rate up. */
  throttleAt: 220,
  throttleScale: 0.4,

  /** Defaults for `Effects.burst` when a caller omits a field. */
  burst: { count: 8, color: 0xff5a3c, speed: 4, size: 0.22, life: 0.5, gravity: 14, spread: 1 },
  /** Random spread applied to size / speed / life. */
  sizeJitter: [0.6, 0.8],
  speedJitter: [0.5, 0.7],
  lifeJitter: [0.7, 0.6],
  spin: 14,
  /** Particle base geometry. */
  geo: { spark: 0.09, flashSphere: 0.16, burst: 0.22 },
  stringSnap: { life: 0.09, scale: 0.55 },
  sparks: { count: 4, scale: [0.6, 0.9], life: 0.25, gravity: 20, spreadXZ: 6, upBase: 1, upRange: 4 },
  /** Ground bounce damping. */
  bounce: { y: -0.35, xz: 0.7 },
  /** Flash expand curve: starts at bounds[0], grows by bounds[1] over its life. */
  flashExpand: [0.5, 1.1],

  /** Named action bursts, used by Game.js. */
  build: [
    { count: 16, color: 0xd8b071, speed: 6, size: 0.26, life: 0.8, gravity: 16 },
    { count: 8, color: 0xffe27a, speed: 5, size: 0.18, life: 0.7, gravity: 12 },
  ],
  upgrade: { count: 18, color: 0xffd166, speed: 7, size: 0.24, life: 0.9, gravity: 14 },
  repair: { count: 14, color: 0x9dff8a, speed: 4.5, size: 0.2, life: 0.9, gravity: -3 },
  repairTower: { count: 12, color: 0x9dff8a, speed: 4, size: 0.18, life: 0.8, gravity: -2 },
  keepIncome: { count: 6, color: 0xf5c518, speed: 4, size: 0.16, life: 0.7, gravity: 16 },
  quarryYield: { count: 6, color: 0xc2cbd6, speed: 3.4, size: 0.16, life: 0.7, gravity: 14 },
  treeChip: [
    { count: 8, color: 0xd8b071, speed: 4.5, size: 0.15, life: 0.6, gravity: 15 },
    { count: 4, color: 0xd8b071, speed: 3, size: 0.11, life: 0.5, gravity: 12 },
  ],
  treeFall: { count: 14, color: 0x6f5a3a, speed: 5, size: 0.22, life: 0.9, gravity: 12 },
  footstep: { count: 2, color: 0xd8cbb0, speed: 1.4, size: 0.14, life: 0.4, gravity: 4 },
  /** Kill reward burst; brute gets more particles. */
  kill: {
    count: { brute: 16, other: 10 },
    speed: 5.5,
    size: 0.24,
    life: 0.75,
    gravity: 18,
    bonus: { count: 6, color: 0xffe27a, speed: 4.5, size: 0.16, life: 0.6, gravity: 14 },
  },
};

/** Coin physics and pickup behaviour. */
export const COIN = {
  gravity: 26,
  /** Seconds before a resting coin starts blinking. */
  restLife: 16,
  /** Seconds before it despawns. */
  maxLife: 24,
  magnetAccel: 34,
  magnetMaxSpeed: 22,
  /** Scatter applied to each coin as it is dropped. */
  scatter: 0.25,
  dropHeight: 0.4,
  /** Horizontal toss speed range on drop. */
  ringSpeed: [2.6, 5.2],
  /** Upward toss speed range on drop. */
  tossSpeed: [5.5, 8.5],
  restY: 0.14,
  /** Vertical speed above which a coin bounces rather than settling. */
  bounceVel: 1.6,
  bounceDampY: -0.42,
  bounceDampXZ: 0.55,
  bob: 0.06,
  bobBase: 0.2,
  spin: 2.2,
  /** Tumble applied to each coin while it is still in the air. */
  tumble: [9, 4],
  /** Blink wave rate and the threshold below which the coin is hidden. */
  blinkRate: 22,
  blinkThreshold: -0.2,
  /** Fraction of life after which a coin fades out, and over how much of it. */
  fadeAt: 0.85,
  fadeSpan: 0.15,
  magnetLift: 10,
  /** Smallest scale a coin shrinks to as it ages. */
  shrinkMin: 0.35,
  magnetSpin: 16,
  /** Collect triggers within `pickupRadius * collectPad`, or above this height. */
  collectPad: 0.55,
  collectHeight: 0.85,
};

/** Arrow/projectile presentation and collision. */
export const PROJECTILE = {
  /** Visual size per team, so tower bolts read heavier than hero arrows. */
  teamScale: { hero: 0.92, tower: 1.3 },
  /** Models are authored at this length. */
  arrowLength: 0.72,
  /** Impact spark count per team. */
  sparkCount: { tower: 6, hero: 4 },
  hitBurst: { count: 3, color: 0xffcf5c, speed: 5, size: 0.1, life: 0.25, gravity: 12 },
  /** Height below which a projectile is culled. */
  groundCull: 0.05,
};

/**
 * Structure animation + aiming feel. Grouped by kind because each structure
 * class reads its own slice and nothing else.
 */
export const FEEL = {
  /** Hit-flash duration shared by every destructible structure. */
  hitFlash: 0.16,
  /** Health-bar colour bands (fraction of max). */
  barGood: 0.6,
  barWarn: 0.3,
  /** Shared collapse motion for every destructible structure. */
  collapse: {
    lean: Math.PI / 2 - 0.15,
    sink: 0.55,
    fadeStart: 0.55,
    fadeSpan: 0.45,
  },

  tower: {
    initialCooldown: 0.4,
    retarget: 0.18,
    turretHeight: 2.0,
    badgeHeight: 3.0,
    centreY: 2.0,
    leadHeight: 0.75,
    pitchClamp: [-1.1, 0.5],
    aimLerp: 7,
    fireTolerance: 0.22,
    idleSweep: 0.3,
    idleSweepLerp: 6,
    idlePitch: -0.05,
    idlePitchLerp: 4,
    recoilDecay: 6,
    recoilZ: 0.22,
    recoilPitch: 0.1,
    scatter: 0.022,
    rangePad: 5,
    draw: { boltZ: -0.62, boltSpan: 0.2, stringDz: 0.18 },
    muzzle: { count: 4, color: 0xd8cbb0, speed: 2.6, size: 0.12, life: 0.45, gravity: 2 },
  },

  bombard: {
    initialCooldown: 1.2,
    retarget: 0.2,
    turretHeight: 1.2,
    badgeHeight: 2.6,
    restElevation: 0.9,
    centreY: 1.6,
    aimLerp: 5,
    fireTolerance: 0.3,
    idleSweep: 0.25,
    idleSweepLerp: 5,
    recoilDecay: 3.2,
    recoilZ: 0.3,
    recoilPitch: 0.12,
    /** Shell visual size. */
    shellSize: 0.17,
    /** Lead prediction assumes this ground speed. */
    leadSpeed: 18,
    /** Impact aim height. */
    impactY: 0.35,
    /** Lob arc = base + span * perUnit. */
    arcBase: 1.4,
    arcPerUnit: 0.24,
    spin: [6, 5],
    /** Blast damage falls off from `inner` at the centre to 1.0 at the rim. */
    falloffInner: 0.45,
    muzzle: { count: 6, color: 0x6b727b, speed: 3.2, size: 0.16, life: 0.5, gravity: 6 },
    blast: [
      { count: 14, color: 0xffb03a, speed: 7.5, size: 0.28, life: 0.5, gravity: 4 },
      { count: 12, color: 0x9d9382, speed: 6, size: 0.26, life: 0.9, gravity: 16 },
      { count: 8, color: 0x6b727b, speed: 3.5, size: 0.32, life: 1.1, gravity: 8 },
    ],
  },

  catapult: {
    initialCooldown: 1.5,
    retarget: 0.25,
    turretHeight: 1.6,
    badgeHeight: 4.0,
    centreY: 1.7,
    aimLerp: 4,
    fireTolerance: 0.35,
    idleSweep: 0.2,
    idleSweepLerp: 4,
    /** Whole-model scale (the engine is authored at full size, then shrunk). */
    modelScale: 0.8,
    /** Throwing-arm rest pose and swing magnitude, shared with the anim. */
    armRest: -0.22,
    armSwing: 1.3,
    /** Throw timing: seconds of fast wind-up, then slower return. */
    throwUp: 0.16,
    throwDown: 0.6,
    /** Boulder visual + roll collision radius. */
    boulderRadius: 0.62,
    leadSpeed: 20,
    impactY: 0.3,
    arcBase: 2.2,
    arcPerUnit: 0.3,
    spin: [4, 3],
    falloffInner: 0.5,
    /** Chance per frame of kicking up dust while a boulder rolls. */
    rollDustChance: 0.35,
    muzzle: { count: 5, color: 0xd8cbb0, speed: 2.6, size: 0.16, life: 0.5, gravity: 3 },
    crash: [
      { count: 14, color: 0x9d9382, speed: 6.5, size: 0.28, life: 0.9, gravity: 18 },
      { count: 8, color: 0xc2b39a, speed: 3.5, size: 0.32, life: 1.1, gravity: 9 },
    ],
    rollHit: { count: 6, color: 0xb9ab90, speed: 4.5, size: 0.2, life: 0.6, gravity: 16 },
    rollDust: { count: 2, color: 0xb9ab90, speed: 1.6, size: 0.2, life: 0.6, gravity: 6 },
    rollEnd: { count: 8, color: 0x9d9382, speed: 3, size: 0.26, life: 0.8, gravity: 12 },
  },

  quarry: {
    badgeHeight: 2.6,
    centreY: 1.6,
  },

  wall: {
    badgePad: 1.1,
    centreY: 0.9,
  },

  keep: {
    /** Enemies stop this far from the keep centre to attack it. */
    attackRadius: 5.2,
    /** Hero cannot walk inside this radius (keep plaza wall). */
    blockRadius: 5.3,
    flash: 0.22,
    /** Shake gained = damage / shakeGain. */
    shakeGain: 40,
    shakeDecay: 3.5,
    shakePos: 0.28,
    shakeRot: 0.035,
    /** Seconds the green repair glow lasts. */
    healGlow: 0.6,
    /** Defeat collapse motion. */
    collapse: {
      sink: 1.9,
      lean: 0.34,
      shudderPos: 0.55,
      shudderYaw: 0.03,
      shudderRoll: 0.025,
      scale: 0.06,
      posWobble: 0.55,
    },
    ember: { base: 0.2, span: 0.55, jitter: 0.45 },
    rubble: {
      interval: 0.1,
      intervalJitter: 0.12,
      radius: 1.4,
      radiusSpan: 2.8,
      yBase: 0.8,
      ySpan: 4.4,
      fireChance: 0.45,
    },
  },

  tree: {
    blockScale: 0.24,
    blockPad: 0.3,
    indicatorY: 3.4,
    indicatorBob: 0.06,
    indicatorBobRate: 2,
    chipAnchorY: 0.8,
    chopWobbleRate: 55,
    chopWobble: 0.09,
    swayRate: 1.1,
    sway: 0.02,
    fallLean: Math.PI / 2 - 0.12,
    fallSink: 0.1,
    /** Fraction of the regrow timer at which the stump is hidden. */
    stumpHide: 0.6,
    regrowStart: 0.15,
    regrowSpan: 0.85,
    regrowTime: 1.1,
  },

  hero: {
    /** Where the archer starts each run. */
    spawn: { x: 0, z: 6, facing: 0 },
    hitFlash: 0.16,
    knockback: 5,
    knockbackDecay: 9,
    moveDamp: 12,
    moveDeadzone: 0.05,
    /** Speed above which the walk cycle is considered active. */
    movingThreshold: 0.35,
    walk: { rate: 7, speedFactor: 1.1, swing: 0.5, bob: 0.06, bobRot: 0.045 },
    /** Idle breathing bob while standing still. */
    idleBob: 0.02,
    idleBobRate: 600,
    idleBobLerp: 6,
    legLerp: 10,
    bobRotLerp: 8,
    footstepInterval: 0.55,
    retarget: 0.15,
    facingLerp: 11,
    aimLerp: 16,
    pitchClamp: [-0.9, 0.5],
    aimAnchorY: -1.05,
    /** Bowstring draw reach and the threshold at which the nocked arrow shows. */
    drawReach: 0.14,
    drawVisible: 0.02,
    /** Length of the arrow nocked on the bow. */
    nockLength: 0.66,
    idleAimLerp: 8,
    idlePitch: -0.12,
    idlePitchLerp: 6,
    recoilDecay: 9,
    recoilZ: 0.16,
    recoilPitch: 0.09,
    /** Rest position of the bow group along Z. */
    bowRestZ: -0.58,
    /** Lowest cooldown the hero can be left with while idle. */
    idleCooldown: 0.12,
    /** Aim lead height, as a fraction of the target's head height. */
    leadHeight: 0.8,
    /** Arrow flight range = weapon range + this. */
    rangePad: 8,
    /** Target scoring: bonus for a target in front, plus an angular weight. */
    targetFrontBonus: 30,
    targetConeWeight: 2.2,
  },
};

/** HUD presentation thresholds. */
export const HUDCFG = {
  /** Keep-bar colour bands, as percentages. */
  keepGoodPct: 55,
  keepWarnPct: 25,
  /** Wood chip pulses "urgent" once the keep is below this percentage. */
  woodUrgentPct: 99.5,
  calloutDuration: 2.2,
  maxFloaters: 40,
  floater: { life: 0.85, rise: 52, scale: 0.25, opacityRate: 4 },
};

/** Virtual-stick / input feel. */
export const INPUT = {
  /** Stick throw distance in pixels at full deflection. */
  maxRadius: 62,
  /** How far the knob graphic travels. */
  knobTravel: 34,
};

/**
 * Map layout. `WORLD` holds the fundamental dimensions; this holds everything
 * the world builder derives from them — the fixed seed, prop densities, lane
 * geometry and placement rules.
 */
export const MAP = {
  /** Fixed seed: the map layout is stable across runs. */
  seed: 90210,
  /** Ground plane extent. */
  groundSize: 400,
  /** Mown-grass stripes. */
  stripes: { from: -24, to: 24, depth: 3.4, step: 6.8, y: 0.005 },
  /** Height of the lane and ring decals (they must not z-fight). */
  laneY: 0.09,
  ringY: 0.06,
  ring: { inner: 7.6, outer: 10.4, segments: 48 },
  lane: { mid: 20, width: 5.4, length: 22 },
  cliff: { segments: 88, edgePad: 1.5, radiusSpan: 3, height: 1.6, heightSpan: 2.4 },
  /** Rules for scattering scenery without blocking lanes or the keep. */
  placement: {
    attempts: 24,
    edgeInset: 6,
    plazaClear: 13,
    laneBand: [6, 34],
    perpMax: 4.5,
    reservedPad: 1.5,
    propPad: 1.2,
    colliderPad: 0.25,
  },
  /** Scenery density: how many of each prop, and its radius. */
  props: {
    trees: { count: 30, radius: 0.9 },
    rocks: { count: 14, radius: 0.8 },
    bushes: { count: 20, radius: 0.5 },
    houses: { count: 2, radius: 2.2 },
    fences: { count: 7, radius: 1.0 },
  },
  /** Ground reserved around the keep that scenery must avoid. */
  plazaReserve: 8,
};

/**
 * Cinematics and camera feel: the opening drone shot, the defeat sweep, the
 * menu orbit, and the small camera touches that run alongside gameplay.
 */
export const CINE = {
  /** Clamp on frame delta, so a tab-switch can't teleport the world. */
  dtClamp: 0.05,

  /** Portrait/narrow-screen FOV widening: [multiplier, aspect threshold] pairs. */
  fovPortrait: [[0.85, 1.28], [1.2, 1.12]],

  /** Follow-camera touches. */
  follow: {
    /** Camera keeps this far inside the map edge. */
    edgePad: 9,
    /** Shake kick when the hero is hit. */
    heroShake: 0.3,
    /** How much keep shake bleeds into the camera. */
    keepShake: 0.8,
    bob: 0.15,
    bobRate: 900,
    lookY: 1.6,
  },

  /** Lighting rig. */
  lights: {
    hemi: 1.15,
    sun: 2.0,
    fill: 0.35,
    sunShadow: { extent: 26, near: 1, far: 120, bias: -0.0007, normalBias: 0.035 },
    sunOffset: { x: 17, y: 36, z: 15 },
  },

  /** Menu idle framing and slow orbit. */
  menu: {
    start: { x: 14, y: 26, z: 30 },
    orbitSpeed: 0.12,
    radius: 26,
    height: 24,
    look: { x: 0, y: 2.5, z: 0 },
  },

  /** Defeat sweep around the fallen keep. */
  defeat: {
    /** Duration = KEEP.collapseTime + this. */
    durationPad: 2.6,
    bearing: Math.PI * 0.9,
    radius: 26,
    height: 24,
    damp: 1.8,
    kick: 0.45,
    look: { x: 0, y: 2.6, z: 0 },
  },

  /** The opening drone shot. */
  intro: {
    duration: 10.0,
    skipWindow: 1.2,
    skipGrace: 0.4,
    holdDuration: 1.0,
    holdKey: 4,
    handForward: 2.8,
    handRight: 2.4,
    handUp: 0.9,
    arcSamples: 220,
    /**
     * Control points in polar terms around the hero. `angle` 0 is straight
     * behind him. `from: 'hands'` / `from: 'follow'` are resolved live.
     */
    camKeys: [
      { angle: 2.6, radius: 33.9, height: 38, lookY: 1.2 },
      { angle: 2.45, radius: 30, height: 31, lookY: 1.2 },
      { angle: 1.9, radius: 22, height: 20, lookY: 1.1 },
      { angle: 1.5, radius: 16, height: 12, lookY: 1.0 },
      { from: 'hands' },
      { angle: -0.5, radius: 14, height: 13, lookY: 1.3 },
      { from: 'follow' },
    ],
  },
};

/** Economy rewards and streaks. */
export const ECONOMY = {
  /** Waves survived bonus: `base + n * perWave` coins. */
  waveClearCoins: { base: 10, perWave: 3 },
  /** Wood granted from wave `fromWave` onward. */
  waveClearWood: { fromWave: 3, amount: 1 },
  /** Keep health restored on a wave clear. */
  waveClearRepair: 4,
  /** Coin pickup streak that raises the pickup pitch. */
  coinStreak: { max: 12, window: 0.55 },
};

