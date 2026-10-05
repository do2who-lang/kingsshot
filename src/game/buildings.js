import { QUARRY, TOWER, WALL } from './config.js';
import { createArcherTower, createQuarry, createWall } from './models.js';
import { Tower } from './Tower.js';
import { Quarry } from './Quarry.js';
import { Wall } from './Wall.js';

/**
 * The catalogue of structures the player can raise.
 *
 * Everything the build menu, the placement ghost and the construction code need
 * lives here, so **adding a new building is a single entry in this list** — the
 * UI and the placement system pick it up automatically.
 *
 * Each entry provides:
 *   id           stable key used by saves/UI
 *   name/blurb   label + one-line description for the build list
 *   glyph        short icon for the build card
 *   blockRadius  footprint, used for collision and placement spacing
 *   maxLevel     upgrade tiers
 *   cost(count)  price of the *next* one, given how many already stand
 *   create(...)  instantiate the live structure
 *   preview(lvl) build a bare model for the translucent placement ghost
 */
export const BUILDING_TYPES = [
  {
    id: 'tower',
    name: TOWER.name,
    blurb: 'Auto-fires arrows at the horde',
    glyph: '\u{1F3F9}', // 🏹
    blockRadius: TOWER.blockRadius,
    maxLevel: TOWER.maxLevel,
    cost(count = 0) {
      return {
        coins: TOWER.buildCost + count * TOWER.costStep,
        stone: TOWER.stoneCost + count * TOWER.stoneStep,
      };
    },
    create: (scene, position, opts) => new Tower(scene, position, opts),
    preview: (level = 1) => createArcherTower(level).root,
  },
  {
    id: 'quarry',
    name: QUARRY.name,
    blurb: 'Cuts stone for towers and repairs',
    glyph: '\u26CF\uFE0F', // ⛏️
    blockRadius: QUARRY.blockRadius,
    maxLevel: QUARRY.maxLevel,
    cost(count = 0) {
      return {
        coins: QUARRY.buildCost + count * QUARRY.costStep,
        stone: 0,
      };
    },
    create: (scene, position, opts) => new Quarry(scene, position, opts),
    preview: (level = 1) => createQuarry(level).root,
  },
  {
    id: 'wall',
    name: WALL.name,
    blurb: 'Snaps to other walls — holds the line',
    glyph: '\u{1F9F1}', // 🧱
    blockRadius: WALL.blockRadius,
    maxLevel: 1,
    /** Marks the structure as grid-snapped and neighbour-connected. */
    connects: true,
    /** Flat price: a rampart is bought in numbers, not in tiers. */
    cost() {
      return { coins: WALL.buildCost, stone: WALL.stoneCost };
    },
    create: (scene, position, opts) => new Wall(scene, position, opts),
    preview: (_level, mask) => createWall(mask ?? {}).root,
  },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]));

/** Look up a building definition by id. */
export const buildDef = (id) => BUILDING_BY_ID[id];
