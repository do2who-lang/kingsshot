import * as THREE from 'three';
import {
  BOMBARD,
  BUILD,
  CAMERA,
  CATAPULT,
  CINE,
  COINS,
  ECONOMY,
  FEEL,
  FX,
  HERO,
  KEEP,
  MAP,
  QUARRY,
  RENDER,
  REPAIR,
  SPAWN,
  STONE,
  TOWER,
  TREE,
  WALL,
  WOOD,
  WORLD,
} from './config.js';
import { createWorld } from './World.js';
import { Keep } from './Keep.js';
import { Player } from './Player.js';
import { Enemy } from './Enemy.js';
import { BUILDING_TYPES, buildDef } from './buildings.js';
import { wallYaw } from './Wall.js';
import { CoinManager } from './Coin.js';
import { ProjectileSystem } from './Projectile.js';
import { Effects } from './Effects.js';
import { WaveManager } from './WaveManager.js';
import { Input } from './Input.js';
import { HUD } from './HUD.js';
import { Sfx } from './Sfx.js';
import { clamp, damp } from './utils.js';
/** The hero cannot walk inside this radius — that's the keep's plaza wall. */
const KEEP_BLOCK_RADIUS = FEEL.keep.blockRadius;
/** World origin, where the keep stands — used to aim the shadows at the ruin. */
const _KEEP_CENTRE = new THREE.Vector3(0, 0, 0);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.hud = new HUD();
    this.sfx = new Sfx();

    this.state = 'menu'; // menu | playing | over
    this.stats = { kills: 0, waves: 0, coins: 0, wood: 0, stone: 0, towers: 0, bombards: 0, catapults: 0, quarries: 0, walls: 0, repairs: 0 };
    this.purse = COINS.starting;
    this.wood = WOOD.starting;
    this.stone = STONE.starting;

    this._initRenderer();
    this._initScene();

    this._buildLevel();

    this._initSystems();

    this.input = new Input(canvas, {
      stickZone: document.getElementById('stick-zone'),
      stickBase: document.getElementById('stick-base'),
      stickKnob: document.getElementById('stick-knob'),
    });
    this.input.onAction = () => this.interact();
    // B opens the build list; cancel leaves placement or closes the list.
    this.input.onBuildMenu = () => this.toggleBuildMenu();
    this.input.onCancel = () => this.cancelOrClose();
    // Skipping the opening take listens for a *fresh* input event; see Input.
    this.input.onAnyInput = () => { this._introSkipRequested = true; };

    // Reused each frame by the camera director.
    this._followPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this._camScratch = new THREE.Vector3();
    this.intro = null;
    this.defeat = null;

    this._bindUi();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    // Give the menu a nice idle camera framing.
    this.camera.position.set(CINE.menu.start.x, CINE.menu.start.y, CINE.menu.start.z);
    this.camera.lookAt(0, 2, 0);

    this._lastTime = 0;
    this._frameHandle = 0;
  }

  /* ------------------------------------------------------------------ *
   * Setup
   * ------------------------------------------------------------------ */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(RENDER.skyColor);
    this.scene.fog = new THREE.Fog(RENDER.fogColor, RENDER.fogNear, RENDER.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      320
    );

    // Soft sky/ground bounce for that flat, cheerful cartoon shading.
    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0x6f9c4a, CINE.lights.hemi);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4dd, CINE.lights.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    const S = CINE.lights.sunShadow;
    const d = S.extent;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = S.near;
    this.sun.shadow.camera.far = S.far;
    this.sun.shadow.bias = S.bias;
    this.sun.shadow.normalBias = S.normalBias;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sunOffset = new THREE.Vector3(
      CINE.lights.sunOffset.x,
      CINE.lights.sunOffset.y,
      CINE.lights.sunOffset.z
    );

    this.fill = new THREE.DirectionalLight(0xbcd7ff, CINE.lights.fill);
    this.fill.position.set(-20, 18, -16);
    this.scene.add(this.fill);
  }

  _buildLevel() {
    // The keep plaza is the only reserved ground now: structures are placed
    // freely by the player, so scenery simply has to avoid the plaza.
    this.world = createWorld(this.scene, {
      reserved: [{ x: 0, z: 0, r: MAP.plazaReserve }],
    });

    this.keep = new Keep(this.scene, { sfx: this.sfx, effects: null });
  }

  _initSystems() {
    this.effects = new Effects(this.scene);
    this.keep.effects = this.effects;

    this.projectiles = new ProjectileSystem(this.scene, this.effects);
    this.coins = new CoinManager(this.scene);

    this.player = new Player(this.scene, {
      projectiles: this.projectiles,
      effects: this.effects,
      sfx: this.sfx,
    });
    this.coins.attachHero(this.player);

    // Structures must exist before anything reads the build menu: pricing
    // depends on how many already stand.
    this.towers = [];
    this.bombards = [];
    this.catapults = [];
    this.quarries = [];
    /** Wall pieces, keyed by "i,j" grid cell so neighbours are O(1) lookups. */
    this.walls = new Map();
    /** Placement mode: { def } while the player is siting a structure. */
    this.placing = null;
    /** Translucent preview model shown during placement. */
    this.ghost = null;
    this._ghostMaterials = [];
    /** Whether the build panel is expanded. Collapsed by default (icon rail). */
    this.buildOpen = false;
    this._coinStreak = 0;
    this._coinStreakTimer = 0;

    // Choppable trees, created by the world builder but driven here.
    this.trees = this.world.trees ?? [];

    this.enemies = [];

    this.waves = new WaveManager({
      gateCount: this.world.spawnGates.length,
      onSpawn: (type, gateIndex, mods) => this._spawnEnemy(type, gateIndex, mods),
      onWaveStart: (n, total, cfg) => {
        this.sfx.waveStart(n);
        this.hud.callout(
          `WAVE ${n}`,
          `${total} enemies • ${cfg.pool.join(' · ')}`,
          SPAWN.waveStartCallout
        );
      },
      onWaveCleared: (n) => {
        this.stats.waves = Math.max(this.stats.waves, n);
        this.sfx.waveClear();
        this.hud.callout('WAVE CLEARED', 'Loot the field, then brace', 1.8, 'good');
        // Clear-wave bonus so the player can afford the next tower.
        const bonus = ECONOMY.waveClearCoins;
        this._addCoins(bonus.base + n * bonus.perWave, new THREE.Vector3(0, 6.5, 0), { silent: true });
        // And a little wood, so a keep that got chewed up has an answer.
        const wood = ECONOMY.waveClearWood;
        this._addWood(n < wood.fromWave ? 0 : wood.amount, new THREE.Vector3(0, 7.2, 0));
        this.keep.repair(ECONOMY.waveClearRepair);
      },
      onCountdown: (seconds) => {
        if (seconds > 0 && seconds <= SPAWN.countdownFrom) {
          this.hud.callout(`WAVE ${this.waves.waveNumber}`, `in ${seconds}…`, SPAWN.countdownCallout, 'warn');
        }
      },
    });

    this._refreshBuildMenu();
  }

  _bindUi() {
    this.hud.onStart(() => this.start());
    this.hud.onRestart(() => this.restart());
    this.hud.onPromptClick(() => this.interact());
    // The build list is data-driven from the building catalogue.
    this.hud.buildBuildMenu(BUILDING_TYPES, {
      onPick: (id) => this.pickBuilding(id),
      onToggle: () => this.toggleBuildMenu(),
      onCancel: () => this.cancelPlacement(),
    });
    // The panel starts collapsed to its icon rail; the player expands it as needed.
    this.hud.setBuildMenuOpen(this.buildOpen);
    this.hud.setPlacing(false);
  }

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  start() {
    this.sfx.init();
    this.sfx.resume();
    this.hud.showOverlay(false);
    this.state = 'playing';
    this.input.enabled = true;
    this.cancelPlacement();
    this.buildOpen = false;
    this.hud.setBuildMenuOpen(false);
    this.purse = COINS.starting;
    this.wood = WOOD.starting;
    this.stone = STONE.starting;
    this.player.reset();
    this.waves.start(SPAWN.firstPrep);
    this.hud.setCoins(this.purse);
    this.hud.setWood(this.wood);
    this.hud.setStone(this.stone);
    this._refreshBuildMenu();
    this._lastTime = performance.now();
    this._beginIntro();
    this.hud.callout('DEFEND THE KEEP', 'Wave 1 incoming', SPAWN.introCallout);
  }

  restart() {
    this._resetLevel();
    this.start();
  }

  _resetLevel() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;

    for (const t of this.towers) t.dispose();
    this.towers.length = 0;

    for (const b of this.bombards) b.dispose();
    this.bombards.length = 0;

    for (const c of this.catapults) c.dispose();
    this.catapults.length = 0;

    for (const q of this.quarries) q.dispose();
    this.quarries = [];

    for (const w of this.walls.values()) w.dispose();
    this.walls.clear();

    // Drop any half-placed structure and start from the collapsed icon rail.
    this.cancelPlacement();
    this.buildOpen = false;
    this.hud.setBuildMenuOpen(false);

    this.projectiles.clear();
    this.coins.clear();
    this.effects.dispose();

    this.keep.health = this.keep.maxHealth;
    this.keep.attackRadius = FEEL.keep.attackRadius;
    this.keep.collapseT = 0;
    this.keep._collapseBurstT = 0;
    this.keep.shake = 0;
    this.keep.healFlash = 0;
    this.keep.incomeTimer = KEEP.incomeInterval;
    this.keep.root.rotation.set(0, 0, 0);
    this.keep.root.position.set(0, 0, 0);
    this.keep.root.scale.setScalar(1);

    // Put the forest back the way it was.
    for (const tree of this.trees) tree.reset();

    this.player.reset();
    this.waves.stop();
    this.purse = COINS.starting;
    this.wood = WOOD.starting;
    this.stone = STONE.starting;
    // Drop the camera state so the follow pose snaps to the hero's spawn rather
    // than easing in from wherever the last run ended.
    this.camTarget = null;
    this.intro = null;
    this.defeat = null;
    this.stats = { kills: 0, waves: 0, coins: 0, wood: 0, stone: 0, towers: 0, bombards: 0, catapults: 0, quarries: 0, walls: 0, repairs: 0 };
    this.hud.reset();
    this.hud.setCoins(this.purse);
    this.hud.setWood(this.wood);
    this.hud.setStone(this.stone);
    this.hud.setHero(1);
    this.hud.setKeep(1, this.keep.maxHealth, this.keep.maxHealth);
    this._refreshBuildMenu();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull back a little on narrow/portrait screens so the field stays readable.
    const ratio = w / h;
    let fovMul = 1;
    for (const [threshold, mult] of CINE.fovPortrait) {
      if (ratio < threshold) { fovMul = mult; break; }
    }
    this.camera.fov = CAMERA.fov * fovMul;
    this.camera.updateProjectionMatrix();
    this.viewport = { width: w, height: h };
  }

  /* ------------------------------------------------------------------ *
   * Spawning + economy
   * ------------------------------------------------------------------ */

  _spawnEnemy(type, gateIndex, mods) {
    const gate = this.world.spawnGates[gateIndex % this.world.spawnGates.length];
    const pos = new THREE.Vector3(
      gate.x + (Math.random() - 0.5) * SPAWN.jitter,
      0,
      gate.z + (Math.random() - 0.5) * SPAWN.jitter
    );

    const enemy = new Enemy(this.scene, type, {
      position: pos,
      keep: this.keep,
      hero: this.player,
      healthScale: mods?.healthScale ?? 1,
      speedScale: mods?.speedScale ?? 1,
    });
    this.enemies.push(enemy);

    this.effects.burst(pos, SPAWN.burst);
    return enemy;
  }

  _addCoins(amount, worldPos, { silent = false } = {}) {
    this.purse += amount;
    this.stats.coins += amount;
    this.hud.setCoins(this.purse);
    if (!silent && worldPos) {
      this.hud.floater(worldPos, `+${amount}`, 'coin');
    }
  }

  _addWood(amount, worldPos) {
    if (amount <= 0) return;
    this.wood += amount;
    this.stats.wood += amount;
    this.hud.setWood(this.wood);
    if (worldPos) this.hud.floater(worldPos, `+${amount} WOOD`, 'wood');
  }

  _addStone(amount, worldPos) {
    if (amount <= 0) return;
    this.stone += amount;
    this.stats.stone += amount;
    this.hud.setStone(this.stone);
    if (worldPos) this.hud.floater(worldPos, `+${amount} STONE`, 'stone');
  }

  /** How many of each structure already stand, keyed by building id. */
  _counts() {
    return {
      tower: this.towers.length,
      bombard: this.bombards.length,
      catapult: this.catapults.length,
      quarry: this.quarries.length,
      wall: this.walls.size,
    };
  }

  /**
   * Price of the next structure, given how many of that kind already stand.
   * Coins and stone both escalate, so you can't raise a whole row at once.
   */
  _priceFor(kind) {
    const def = buildDef(kind);
    if (!def) return { coins: 0, stone: 0 };
    return def.cost(this._counts()[kind] ?? 0);
  }

  /** Push current prices, affordability and selection into the build list. */
  _refreshBuildMenu() {
    this.hud.updateBuildCards({
      coins: this.purse,
      stone: this.stone,
      counts: this._counts(),
      selected: this.placing?.def.id ?? null,
    });
  }

  /**
   * Every structure enemies can besiege: towers and quarries alike. Both expose
   * the same small interface (`alive`, `blockRadius`, `root`, `takeDamage`), so
   * the enemy code does not care which is which.
   */
  get _buildings() {
    return [
      ...this.towers,
      ...this.bombards,
      ...this.catapults,
      ...this.quarries,
      ...this.walls.values(),
    ];
  }

  /* ------------------------------------------------------------------ *
   * Contextual interaction
   *
   * One verb, four meanings. Everything the hero could act on is collected
   * into a single candidate list so the prompt and the button can never
   * disagree about what "the thing" is.
   * ------------------------------------------------------------------ */

  /**
   * Intent priority: lower wins. Emergency repairs must never be shadowed by
   * a luxury upgrade.
   */
  static PRIORITY = { repair: 0, chop: 1, upgrade: 2 };

  /**
   * @returns {Array<object>} every action available right now, with distances.
   *
   * Distances are computed here from the hero's live position rather than read
   * from each object's cached value. That cached value is refreshed by a
   * different system (`_updateTrees`), and depending on it would silently
   * couple the prompt to the order those systems happen to run in.
   */
  _interactionCandidates() {
    const heroPos = this.player.root.position;
    const out = [];

    const distTo = (x, z) => Math.hypot(heroPos.x - x, heroPos.z - z);

    // --- Structures: mend a battered one, otherwise offer an upgrade ---
    for (const building of this._buildings) {
      if (!building.alive) continue;
      const distance = distTo(building.root.position.x, building.root.position.z);
      if (distance >= BUILD.interactRange) continue;

      if (building.isDamaged) {
        const affordable = this.wood >= REPAIR.woodCost && this.stone >= REPAIR.stoneCost;
        const label = building.canUpgrade
          ? `${building.name} — Lv ${building.level}`
          : building.name;
        out.push({
          kind: 'repair-tower',
          priority: Game.PRIORITY.repair,
          dist: distance,
          enabled: affordable,
          tower: building,
          title: label,
          sub:
            `<span class="cost">${REPAIR.woodCost}</span> wood + ` +
            `<span class="stone">${REPAIR.stoneCost}</span> stone &rarr; ` +
            `<span class="heal">+${REPAIR.towerHealAmount}</span> HP &middot; ` +
            `${Math.ceil(building.health)}/${building.maxHealth}`,
          verb: affordable
            ? 'REPAIR'
            : this.wood < REPAIR.woodCost
              ? `NEED ${REPAIR.woodCost} WOOD`
              : `NEED ${REPAIR.stoneCost} STONE`,
        });
        continue;
      }

      if (building.canUpgrade) {
        const cost = building.upgradeCost;
        const stoneCost = building.upgradeStoneCost ?? 0;
        const affordable = this.purse >= cost && this.stone >= stoneCost;
        out.push({
          kind: 'upgrade',
          priority: Game.PRIORITY.upgrade,
          dist: distance,
          enabled: affordable,
          plot: building,
          title: `${building.name} — Lv ${building.level}`,
          sub: this._costLine(cost, stoneCost, `to upgrade to Lv ${building.level + 1}`),
          verb: affordable ? 'UPGRADE' : this._shortfall({ cost, stoneCost }),
        });
      }
    }

    // --- Trees: chop for wood ---
    for (const tree of this.trees) {
      const distance = distTo(tree.x, tree.z);
      if (!tree.canChopAt(distance)) continue;
      out.push({
        kind: 'chop',
        priority: Game.PRIORITY.chop,
        dist: distance,
        enabled: true,
        tree,
        title: 'Chop Tree',
        sub: `<span class="cost">+${TREE.woodPerChop}</span> wood &middot; ${
          tree.chopsLeft
        } chop${tree.chopsLeft === 1 ? '' : 's'} left`,
        verb: 'CHOP',
      });
    }

    // --- Keep: spend wood + stone to patch it up ---
    const keepDist = distTo(0, 0);
    if (keepDist < REPAIR.range && this.keep.health < this.keep.maxHealth) {
      const affordable = this.wood >= REPAIR.woodCost && this.stone >= REPAIR.stoneCost;
      out.push({
        kind: 'repair',
        priority: Game.PRIORITY.repair,
        dist: keepDist,
        enabled: affordable,
        title: 'Repair Keep',
        sub:
          `<span class="cost">${REPAIR.woodCost}</span> wood + ` +
          `<span class="stone">${REPAIR.stoneCost}</span> stone &rarr; ` +
          `<span class="heal">+${REPAIR.healAmount}</span> keep HP`,
        verb: affordable
          ? 'REPAIR'
          : this.wood < REPAIR.woodCost
            ? `NEED ${REPAIR.woodCost} WOOD`
            : `NEED ${REPAIR.stoneCost} STONE`,
      });
    }

    return out;
  }

  /** "40 coins + 6 stone to build" — the cost clause shared by build prompts. */
  _costLine(coins, stone, suffix) {
    const parts = [`<span class="cost">${coins}</span> coins`];
    if (stone > 0) parts.push(`<span class="stone">${stone}</span> stone`);
    return `${parts.join(' + ')} ${suffix}`;
  }

  /** Why an action is disabled: which resource the hero is short of. */
  _shortfall(action) {
    if (this.purse < action.cost) return `NEED ${action.cost} COINS`;
    if (this.stone < action.stoneCost) return `NEED ${action.stoneCost} STONE`;
    return 'GO';
  }

  /**
   * The action the hero should perform.
   *
   * Usable actions always beat unusable ones (standing between a tree you can
   * chop and a pad you can't afford still lets you chop). Among usable actions,
   * intent priority decides — mending something broken matters more than
   * spending coins — and distance breaks the remaining ties.
   */
  _findInteraction() {
    const list = this._interactionCandidates();
    if (!list.length) return null;

    const usable = list.filter((c) => c.enabled);
    const pool = usable.length ? usable : list;

    let best = pool[0];
    for (const c of pool) {
      if (c.priority < best.priority) best = c;
      else if (c.priority === best.priority && c.dist < best.dist) best = c;
    }
    return best;
  }

  /** The single "do the thing" verb. */
  interact() {
    if (this.state !== 'playing') return;

    // While siting a structure the action button means "place it here".
    if (this.placing) {
      this._tryPlace();
      return;
    }

    const action = this._findInteraction();
    if (!action) return;

    if (!action.enabled) {
      // Denied: a short, obviously-negative blip.
      this.sfx.denied();
      return;
    }

    switch (action.kind) {
      case 'upgrade':
        this._upgradeStructure(action.plot);
        break;
      case 'chop':
        this._chopTree(action.tree);
        break;
      case 'repair':
        this._repairKeep();
        break;
      case 'repair-tower':
        this._repairTower(action.tower);
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Build list + free placement
   *
   * Structures are not tied to fixed pads. The player opens the build list,
   * picks one, and a translucent ghost is sited at the hero's feet — walk to a
   * clear spot, then PLACE. Validity is checked against the keep plaza, other
   * structures, trees and scenery.
   * ------------------------------------------------------------------ */

  toggleBuildMenu() {
    if (this.state !== 'playing') return;
    this.buildOpen = !this.buildOpen;
    this.hud.setBuildMenuOpen(this.buildOpen);
    this._refreshBuildMenu();
  }

  closeBuildMenu() {
    this.buildOpen = false;
    this.hud.setBuildMenuOpen(false);
  }

  /** Cancel key: leave placement if siting, otherwise close the build list. */
  cancelOrClose() {
    if (this.placing) this.cancelPlacement();
    else if (this.buildOpen) this.closeBuildMenu();
  }

  /** A card was tapped: start placing that building, or cancel if already. */
  pickBuilding(id) {
    if (this.state !== 'playing') return;
    if (this.placing?.def.id === id) {
      this.cancelPlacement();
      return;
    }
    this.beginPlacement(id);
  }

  /** Enter placement mode for a building, showing its translucent ghost. */
  beginPlacement(id) {
    const def = buildDef(id);
    if (!def) return;

    this.cancelPlacement();
    this.placing = { def };
    this._ghostKey = null;
    this._makeGhost(def, {});
    this.hud.setPlacing(true);
    this._refreshBuildMenu();
  }

  /** (Re)create the placement ghost for `def`, shaped by `mask` when relevant. */
  _makeGhost(def, mask) {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this._disposeGhost(this.ghost);
      this.ghost = null;
    }
    this.ghost = def.preview(1, mask);
    this._styleGhost(this.ghost);
    this.scene.add(this.ghost);
  }

  /** Tear down the ghost and leave placement mode. */
  cancelPlacement() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this._disposeGhost(this.ghost);
      this.ghost = null;
    }
    this._ghostMaterials = [];
    this._ghostKey = null;
    this.placing = null;
    this.hud.setPlacing(false);
    this._refreshBuildMenu();
  }

  /** Dispose a ghost subtree's geometry and materials exactly once each. */
  _disposeGhost(group) {
    const geometries = new Set();
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) geometries.add(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    });
    for (const geo of geometries) geo.dispose();
  }

  /** Grid key for a wall cell. */
  _wallKey(i, j) {
    return `${i},${j}`;
  }

  /** Which neighbouring cells hold a wall piece. */
  _wallMask(i, j) {
    return {
      n: this.walls.has(this._wallKey(i, j - 1)),
      s: this.walls.has(this._wallKey(i, j + 1)),
      e: this.walls.has(this._wallKey(i + 1, j)),
      w: this.walls.has(this._wallKey(i - 1, j)),
    };
  }

  /**
   * Where a piece actually sits. Most structures go at the hero's feet; walls
   * snap to the shared grid so neighbouring pieces line up.
   */
  _placementPoint(def, x, z) {
    if (def.connects) {
      const c = WALL.cell;
      const i = Math.round(x / c);
      const j = Math.round(z / c);
      return { x: i * c, z: j * c, i, j };
    }
    return { x, z };
  }

  /** Re-shape a wall's four neighbours after a piece is added or removed. */
  _refreshWallNeighbours(i, j) {
    for (const [di, dj] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      const ni = i + di;
      const nj = j + dj;
      const w = this.walls.get(this._wallKey(ni, nj));
      if (w) w.setMask(this._wallMask(ni, nj));
    }
  }

  /** Make a freshly built preview translucent and collect its materials. */
  _styleGhost(root) {
    this._ghostMaterials = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.renderOrder = 6;

      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.5;
        c.depthWrite = false;
        if (c.emissive) {
          c.emissive = c.emissive.clone();
          c.emissive.setHex(0x000000);
          this._ghostMaterials.push(c);
        }
        return c;
      });
      o.material = cloned.length === 1 ? cloned[0] : cloned;
    });
  }

  /**
   * Follow the hero with the ghost and tint it by validity.
   * @returns {boolean} whether the current spot is buildable.
   */
  _updatePlacement() {
    if (!this.placing || !this.ghost) return true;

    const def = this.placing.def;
    const p = this.player.root.position;
    const pt = this._placementPoint(def, p.x, p.z);

    // Wall ghosts re-shape to match the neighbours they would connect to.
    if (def.connects) {
      const key = this._wallKey(pt.i, pt.j);
      if (key !== this._ghostKey) {
        this._ghostKey = key;
        this._makeGhost(def, this._wallMask(pt.i, pt.j));
      }
    }

    this.ghost.position.set(pt.x, 0, pt.z);
    // A lone wall piece turns to face the keep; the ghost previews that turn.
    if (def.connects) {
      const mask = this._wallMask(pt.i, pt.j);
      this.ghost.rotation.y = wallYaw(mask, pt.x, pt.z);
    }

    const valid = this._placementValid(def, pt);
    const tint = valid ? BUILD.validTint : BUILD.invalidTint;
    for (const m of this._ghostMaterials) {
      m.emissive.setHex(tint);
      m.emissiveIntensity = BUILD.ghostPulse.base + Math.sin(performance.now() / BUILD.ghostPulse.rate) * BUILD.ghostPulse.amp;
    }
    return valid;
  }

  /** Can `def` stand at `pt` (an already-snapped placement point)? */
  _placementValid(def, pt) {
    const { x, z } = pt;
    const limit = WORLD.size - BUILD.edgeMargin;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;

    // Keep plaza. Walls may ring the keep more tightly than freestanding builds.
    const keepClear = def.connects ? WALL.keepClearance : BUILD.keepClearance;
    if (Math.hypot(x, z) < keepClear + def.blockRadius) return false;

    // One wall piece per grid cell.
    if (def.connects && this.walls.has(this._wallKey(pt.i, pt.j))) return false;

    // Other structures. Walls are governed by the grid rule above, so a wall
    // skips them; anything else just keeps a berth from a wall's footprint.
    for (const b of this._buildings) {
      if (b.kind === 'wall') {
        if (def.connects) continue;
        const dw = Math.hypot(x - b.root.position.x, z - b.root.position.z);
        if (dw < def.blockRadius + WALL.blockRadius) return false;
        continue;
      }
      const d = Math.hypot(x - b.root.position.x, z - b.root.position.z);
      if (d < def.blockRadius + b.blockRadius + BUILD.spacing) return false;
    }

    // Standing trees (felled ones stop blocking).
    for (const tree of this.trees) {
      if (!tree.blocks) continue;
      const d = Math.hypot(x - tree.x, z - tree.z);
      if (d < def.blockRadius + tree.blockRadius + BUILD.treePad) return false;
    }

    // Scenery: rocks, houses, fences.
    for (const c of this.world.colliders) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < def.blockRadius + c.r + BUILD.colliderPad) return false;
    }

    return true;
  }

  /** Place the ghost as a real structure, if the site and stock allow. */
  _tryPlace() {
    const def = this.placing?.def;
    if (!def) return false;

    const p = this.player.root.position;
    const pt = this._placementPoint(def, p.x, p.z);

    if (!this._placementValid(def, pt)) {
      this.sfx.denied();
      this.hud.floater(new THREE.Vector3(pt.x, 2.2, pt.z), "CAN'T BUILD HERE", 'bad');
      return false;
    }

    const price = def.cost(this._counts()[def.id] ?? 0);
    if (this.purse < price.coins || this.stone < price.stone) {
      this.sfx.denied();
      return false;
    }

    this.purse -= price.coins;
    this.stone -= price.stone;
    this.hud.setCoins(this.purse);
    this.hud.setStone(this.stone);

    const opts = { effects: this.effects, projectiles: this.projectiles, sfx: this.sfx, hud: this.hud };
    if (def.connects) {
      opts.cell = { i: pt.i, j: pt.j };
      opts.mask = this._wallMask(pt.i, pt.j);
    }
    const structure = def.create(this.scene, new THREE.Vector3(pt.x, 0, pt.z), opts);

    if (def.id === 'quarry') {
      this.quarries.push(structure);
      this.stats.quarries += 1;
    } else if (def.id === 'bombard') {
      this.bombards.push(structure);
      this.stats.bombards += 1;
    } else if (def.id === 'catapult') {
      this.catapults.push(structure);
      this.stats.catapults += 1;
    } else if (def.id === 'wall') {
      this.walls.set(this._wallKey(pt.i, pt.j), structure);
      this.stats.walls += 1;
      // The new piece connects its neighbours, which re-shape to meet it.
      this._refreshWallNeighbours(pt.i, pt.j);
    } else {
      this.towers.push(structure);
      this.stats.towers += 1;
    }

    this.sfx.build();
    this.effects.burst(new THREE.Vector3(pt.x, 1.4, pt.z), FX.build[0]);
    this.effects.burst(new THREE.Vector3(pt.x, 1.8, pt.z), FX.build[1]);
    this.hud.floater(
      new THREE.Vector3(pt.x, 2.4, pt.z),
      `${def.name.toUpperCase()} BUILT`,
      'good'
    );

    this.cancelPlacement();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Wood: chopping and repairing
   * ------------------------------------------------------------------ */

  _chopTree(tree) {
    const gained = tree.chop();
    if (!gained) return false;

    this.wood += gained;
    this.stats.wood += gained;
    this.hud.setWood(this.wood);

    const anchor = tree.chipAnchor();
    this.effects.burst(anchor, FX.treeChip[0]);
    this.effects.burst(anchor, FX.treeChip[1]);

    this.hud.floater(anchor, `+${gained} WOOD`, 'wood');

    if (tree.isChopped) {
      // Fell! Dust plume and a chunkier sound sell the weight of it.
      this.sfx.treeFall();
      this.effects.burst(new THREE.Vector3(tree.x, 0.4, tree.z), FX.treeFall);
      this.hud.floater(new THREE.Vector3(tree.x, 2.4, tree.z), 'TIMBER!', 'good');
    } else {
      this.sfx.chop();
    }
    return true;
  }

  _repairKeep() {
    if (this.wood < REPAIR.woodCost || this.stone < REPAIR.stoneCost) return false;
    if (this.keep.health >= this.keep.maxHealth) return false;

    this.wood -= REPAIR.woodCost;
    this.stone -= REPAIR.stoneCost;
    this.hud.setWood(this.wood);
    this.hud.setStone(this.stone);
    this.keep.repair(REPAIR.healAmount);
    this.keep.healFlash = FEEL.keep.healGlow;
    this.stats.repairs += 1;

    // Mossy-green sparks rising out of the walls.
    const pos = new THREE.Vector3(0, 3.2, -3.2);
    this.effects.burst(pos, FX.repair);
    this.sfx.repair();
    this.hud.floater(pos, `+${REPAIR.healAmount} KEEP`, 'heal');
    return true;
  }

  /** Patch up a battered tower or quarry. Same resources, same verb. */
  _repairTower(tower) {
    if (this.wood < REPAIR.woodCost || this.stone < REPAIR.stoneCost) return false;
    if (!tower.repair(REPAIR.towerHealAmount)) return false;

    this.wood -= REPAIR.woodCost;
    this.stone -= REPAIR.stoneCost;
    this.hud.setWood(this.wood);
    this.hud.setStone(this.stone);
    this.stats.repairs += 1;

    const pos = new THREE.Vector3(tower.root.position.x, 2.6, tower.root.position.z);
    this.effects.burst(pos, FX.repairTower);
    this.sfx.repair();
    const label =
      tower.kind === 'quarry' ? 'QUARRY'
      : tower.kind === 'bombard' ? 'BOMBARD'
      : tower.kind === 'catapult' ? 'CATAPULT'
      : 'TOWER';
    this.hud.floater(pos, `+${REPAIR.towerHealAmount} ${label}`, 'heal');
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Structures
   * ------------------------------------------------------------------ */

  /** Spend coins + stone to raise a standing structure a tier. */
  _upgradeStructure(structure) {
    if (!structure) return false;
    const cost = structure.upgradeCost;
    const stoneCost = structure.upgradeStoneCost ?? 0;
    if (!structure.canUpgrade || this.purse < cost || this.stone < stoneCost) return false;

    this.purse -= cost;
    this.stone -= stoneCost;
    this.hud.setCoins(this.purse);
    this.hud.setStone(this.stone);

    structure.upgrade();
    this.sfx.build();
    const base = structure.root.position;
    this.effects.burst(new THREE.Vector3(base.x, 1.8, base.z), FX.upgrade);
    this.hud.floater(
      new THREE.Vector3(base.x, 2.6, base.z),
      `LV ${structure.level}`,
      'good'
    );
    this._refreshBuildMenu();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * World collision (hero only — enemies path straight through props)
   * ------------------------------------------------------------------ */

  _collide(pos) {
    const limit = WORLD.size - WORLD.heroClampPad;
    pos.x = clamp(pos.x, -limit, limit);
    pos.z = clamp(pos.z, -limit, limit);

    // Keep plaza.
    const kd = Math.hypot(pos.x, pos.z);
    if (kd < KEEP_BLOCK_RADIUS) {
      const d = kd || 0.0001;
      pos.x = (pos.x / d) * KEEP_BLOCK_RADIUS;
      pos.z = (pos.z / d) * KEEP_BLOCK_RADIUS;
    }

    // Towers, quarries and walls are solid, so keep a respectful berth. The
    // zero-distance fallback shoves the hero out along +X when he ends up dead
    // centre inside a structure (a big step can jump past the rim in one frame).
    for (const b of this._buildings) {
      let dx = pos.x - b.root.position.x;
      let dz = pos.z - b.root.position.z;
      let d = Math.hypot(dx, dz);
      const r = b.blockRadius + BUILD.heroBerth;
      if (d >= r) continue;
      if (d < 0.0001) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      pos.x = b.root.position.x + (dx / d) * r;
      pos.z = b.root.position.z + (dz / d) * r;
    }

    // Scenery.
    for (const c of this.world.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r && d > 0.0001) {
        pos.x = c.x + (dx / d) * c.r;
        pos.z = c.z + (dz / d) * c.r;
      }
    }

    // Tree trunks. Felled trees stop blocking, so a cleared glade is walkable.
    for (const tree of this.trees) {
      if (!tree.blocks) continue;
      const dx = pos.x - tree.x;
      const dz = pos.z - tree.z;
      const d = Math.hypot(dx, dz);
      const r = tree.blockRadius;
      if (d < r && d > 0.0001) {
        pos.x = tree.x + (dx / d) * r;
        pos.z = tree.z + (dz / d) * r;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Main loop
   * ------------------------------------------------------------------ */

  run() {
    // Own tiny clock so we avoid the deprecated THREE.Clock.
    this._lastTime = performance.now();

    const loop = (now) => {
      this._frameHandle = requestAnimationFrame(loop);
      const dt = Math.min((now - this._lastTime) / 1000, CINE.dtClamp);
      this._lastTime = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this._frameHandle = requestAnimationFrame(loop);
  }

  update(dt) {
    if (this.state === 'playing') {
      this._updateGameplay(dt);
    } else if (this.state === 'over') {
      this.effects.update(dt);
      this._updateTrees(dt);
      if (this.keep.isDestroyed) {
        // The keep falling gets its own camera: sweep around the ruin the way
        // the opening screen circles the castle while it comes down.
        this.keep.updateCollapse(dt);
        this._updateDefeat(dt);
      } else {
        this.keep.update(dt, {});
        this._updateCameraOrIntro(dt);
      }
      this._updateSun();
    } else {
      // Menu: slow orbit around the keep for a living backdrop.
      this._updateMenuOrbit(dt);
      this._updateTrees(dt);
      this.hud.update(dt, this.camera, this.viewport);
    }
  }

  /**
   * Trees own their own animations (sway, topple, regrow) and their own
   * collision, so they keep ticking even after the run ends.
   */
  _updateTrees(dt) {
    const heroPos = this.player.root.position;
    for (const tree of this.trees) {
      tree.measureDistance(heroPos);
      tree.update(dt, this.camera);
    }
  }

  _updateGameplay(dt) {
    const move = this.input.sample();
    this.player.update(dt, {
      move,
      enemies: this.enemies,
      collide: (pos) => this._collide(pos),
    });

    this.keep.update(dt, {
      onIncome: (amount, pos) => {
        this._addCoins(amount, pos, { silent: true });
        this.effects.burst(pos, FX.keepIncome);
      },
    });

    this._updateTrees(dt);

    const ctx = {
      enemies: this.enemies,
      // Enemies besiege towers and quarries alike; both expose the same interface.
      towers: this._buildings,
      camera: this.camera,
      onAttackKeep: (enemy, damage) => {
        // The keep is earthworks and masonry: enemies chip it, not shatter it,
        // so a single rush can't level it before the hero can get back to it.
        const dealt = Math.max(1, Math.round(damage * KEEP.damageTakenScale));
        this.keep.damage(dealt, new THREE.Vector3(
          enemy.root.position.x,
          2.4,
          enemy.root.position.z
        ));
      },
      onAttackTower: (enemy, damage, building) => {
        // Structures are hacked at rather than shattered, so they chip slowly.
        const scale =
          building.kind === 'quarry' ? QUARRY.damageTakenScale
          : building.kind === 'bombard' ? BOMBARD.damageTakenScale
          : building.kind === 'catapult' ? CATAPULT.damageTakenScale
          : TOWER.damageTakenScale;
        const dealt = Math.max(1, Math.round(damage * scale));
        building.takeDamage(dealt);
        this.sfx.towerHit();
        this.effects.sparks(
          new THREE.Vector3(building.root.position.x, 1.5, building.root.position.z),
          4
        );
        this.hud.floater(
          new THREE.Vector3(building.root.position.x, building.badgeHeight, building.root.position.z),
          `-${dealt}`,
          'bad'
        );
        if (building.destroyed) {
          const down =
            building.kind === 'quarry'
              ? ['QUARRY DOWN', 'Your stone supply is cut']
              : building.kind === 'bombard'
                ? ['BOMBARD DOWN', 'The shelling has stopped']
                : building.kind === 'catapult'
                  ? ['CATAPULT DOWN', 'Your boulder thrower is gone']
                  : ['TOWER DOWN', 'Rebuild or defend'];
          this.hud.callout(down[0], down[1], 1.6, 'warn');
        }
        void enemy;
      },
      onAttackHero: (enemy, damage) => {
        this.player.takeDamage(damage, enemy.root.position);
        this.hud.floater(
          new THREE.Vector3(
            this.player.root.position.x,
            1.9,
            this.player.root.position.z
          ),
          `-${damage}`,
          'bad'
        );
      },
    };

    // --- Enemies ---
    for (const e of this.enemies) {
      e.update(dt, ctx);

      // Award the kill exactly once.
      if (!e.alive && !e.rewarded) {
        e.rewarded = true;
        this._onEnemyKilled(e);
      }
    }

    // --- Structures ---
    for (const t of this.towers) t.update(dt, this.enemies);
    for (const b of this.bombards) b.update(dt, this.enemies);
    for (const c of this.catapults) c.update(dt, this.enemies);
    for (const w of this.walls.values()) w.update(dt);

    // Quarries tick their stone output every few seconds.
    for (const q of this.quarries) {
      q.update(dt, {
        onYield: (amount, pos) => {
          this._addStone(amount, pos);
          this.sfx.stone();
          this.effects.burst(pos, FX.quarryYield);
        },
      });
    }

    // Collapsed structures topple into rubble and are removed. The player can
    // simply build a fresh one anywhere, so no pad is freed.
    for (const list of [this.towers, this.bombards, this.catapults, this.quarries]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (!b.collapseFinished) continue;
        b.dispose();
        list.splice(i, 1);
      }
    }

    // A lost wall piece leaves a gap: drop it and re-shape what remains.
    if (this.walls.size) {
      for (const [key, w] of [...this.walls]) {
        if (!w.collapseFinished) continue;
        const [i, j] = key.split(',').map(Number);
        w.dispose();
        this.walls.delete(key);
        this._refreshWallNeighbours(i, j);
      }
    }

    // Keep the build list's prices and affordability in step with the purse.
    this._refreshBuildMenu();

    // --- Projectiles ---
    this.projectiles.update(dt, this.enemies, (enemy, damage, point) => {
      enemy.takeDamage(damage, point);
      this.sfx.hit();
      if (enemy.alive) {
        this.hud.floater(point, String(Math.round(damage)), 'dmg');
      }
    });

    // --- Coins ---
    this._coinStreakTimer -= dt;
    if (this._coinStreakTimer <= 0) this._coinStreak = 0;

    this.coins.update(dt, {
      onCollect: (value) => {
        this.purse += value;
        this.stats.coins += value;
        this.hud.setCoins(this.purse);
        this.sfx.coin(this._coinStreak);
        this._coinStreak = Math.min(ECONOMY.coinStreak.max, this._coinStreak + 1);
        this._coinStreakTimer = ECONOMY.coinStreak.window;
      },
    });

    this.effects.update(dt);

    // --- Waves ---
    const aliveCount = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
    this.waves.update(dt, aliveCount);

    // Clean up finished corpses after the death animation.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removable) {
        this.enemies[i].dispose();
        this.enemies.splice(i, 1);
      }
    }

    // --- Placement ghost + HUD/prompt ---
    this._placingValid = this._updatePlacement();
    this._updatePrompt();
    this.hud.setKeep(this.keep.healthRatio, this.keep.health, this.keep.maxHealth);
    this.hud.setHero(this.player.healthRatio);
    this.hud.setWave(this.waves.waveNumber, this.waves.remaining(aliveCount));

    this._updateCameraOrIntro(dt);
    this._updateSun();
    this.hud.update(dt, this.camera, this.viewport);

    // --- Loss conditions ---
    if (this.keep.isDestroyed) this._endGame('THE KEEP FELL', 'They broke through.', 'keep');
    else if (this.player.dead) this._endGame('THE HERO FELL', 'You were overrun.', 'hero');
  }

  _onEnemyKilled(enemy) {
    this.stats.kills += 1;

    // Killing pays: a little health back keeps the hero pushing forward.
    if (!this.player.dead) this.player.heal(HERO.healPerKill);

    const center = new THREE.Vector3(
      enemy.root.position.x,
      0.6,
      enemy.root.position.z
    );

    // The reward: coins get thrown out of the body.
    this.coins.drop(center, enemy.bounty.count, enemy.bounty.value);

    const K = FX.kill;
    this.effects.burst(center, {
      count: enemy.type.id === 'brute' ? K.count.brute : K.count.other,
      color: enemy.type.color,
      speed: K.speed,
      size: K.size * enemy.type.scale,
      life: K.life,
      gravity: K.gravity,
    });
    this.effects.burst(center, K.bonus);

    this.sfx.enemyDie();
    this.hud.floater(
      new THREE.Vector3(enemy.root.position.x, enemy.headHeight + 0.6, enemy.root.position.z),
      enemy.type.name.toUpperCase(),
      'kill'
    );
  }

  _updatePrompt() {
    // Placement mode owns the prompt: it is the "place it here" confirmation.
    if (this.placing) {
      const def = this.placing.def;
      const price = def.cost(this._counts()[def.id] ?? 0);
      const affordable = this.purse >= price.coins && this.stone >= price.stone;
      const valid = this._placingValid !== false;
      const enabled = valid && affordable;

      let suffix = '&middot; press to place';
      if (!valid) suffix = '&middot; blocked &mdash; find clear ground';
      else if (!affordable) suffix = '&middot; not enough resources';

      this.hud.setPrompt({
        title: `Build ${def.name}`,
        sub: this._costLine(price.coins, price.stone, suffix),
        enabled,
        label: enabled
          ? 'PLACE'
          : valid
            ? this._shortfall({ cost: price.coins, stoneCost: price.stone })
            : "CAN'T PLACE",
      });
      return;
    }

    const action = this._findInteraction();
    if (!action) {
      this.hud.setPrompt(null);
      return;
    }

    this.hud.setPrompt({
      title: action.title,
      sub: action.sub,
      enabled: action.enabled,
      label: action.verb,
    });
  }

  /**
   * Where the normal gameplay camera wants to be this frame.
   *
   * Split out from `_updateCamera` so the opening drone shot can blend into the
   * *live* gameplay framing and land on it exactly, instead of snapping at
   * handover — and so it keeps working even if the player has already run off.
   */
  _computeFollowPose(dt) {
    const p = this.player.root.position;
    const limit = WORLD.size - CINE.follow.edgePad;
    const tx = clamp(p.x, -limit, limit);
    const tz = clamp(p.z, -limit, limit);

    if (!this.camTarget) {
      this.camTarget = new THREE.Vector3(tx, 0, tz);
    }
    this.camTarget.x = damp(this.camTarget.x, tx, CAMERA.followLerp, dt);
    this.camTarget.z = damp(this.camTarget.z, tz, CAMERA.followLerp, dt);

    // Slight kickback when the hero takes a hit, plus keep rumble.
    const F = CINE.follow;
    const shake = Math.max(this.player.hitFlash > 0 ? F.heroShake : 0, this.keep.shake * F.keepShake);
    const sx = (Math.random() - 0.5) * shake;
    const sz = (Math.random() - 0.5) * shake;

    this._followPose.pos.set(
      this.camTarget.x + CAMERA.offset.x + sx,
      CAMERA.offset.y + Math.sin(performance.now() / F.bobRate) * F.bob,
      this.camTarget.z + CAMERA.offset.z + sz
    );
    this._followPose.look.set(this.camTarget.x, F.lookY, this.camTarget.z);
    return this._followPose;
  }

  _updateCamera(dt) {
    const pose = this._computeFollowPose(dt);
    this.camera.position.copy(pose.pos);
    this.camera.lookAt(pose.look);
  }

  /** Runs the opening drone shot if one is armed, otherwise the normal camera. */
  _updateCameraOrIntro(dt) {
    if (!this.intro || !this._updateIntro(dt)) this._updateCamera(dt);
  }

  /* ------------------------------------------------------------------ *
   * Opening drone shot
   * ------------------------------------------------------------------ */

  /**
   * Arms the opening cinematic.
   *
   * ONE continuous take, ~10s: a single swept move with one deliberate
   * one-second hold on the bow close-up. Driven by a single eased parameter
   * over a Catmull-Rom path, split into two eased moves either side of the hold.
   *
   * The curve matters. An earlier version cross-faded between two "poses" with
   * smoothsteps, and because smoothstep has zero derivative at both ends the
   * camera decelerated to a dead stop at the close-up and restarted — measurably
   * 26 -> 3.6 -> 26 units/s — which read as two shots stitched together.
   * Catmull-Rom is C1 continuous through every control point, so the camera
   * sweeps down, through the bow close-up, and back out in one unbroken move.
   */
  _beginIntro() {
    this.intro = {
      t: 0,
      duration: CINE.intro.duration,
      /** Any input inside this window before the end skips the rest. */
      skipWindow: CINE.intro.skipWindow,
      /** Input is ignored for this long at the start, so the START click itself
       *  cannot cancel the shot. */
      skipGrace: CINE.intro.skipGrace,
      /** Camera comes to a dead stop on the bow for this long. The moving part
       *  of the take keeps its old 9s pace; this is added on top of it. */
      holdDuration: CINE.intro.holdDuration,
      /** Index in INTRO_CAM_KEYS of the bow close-up we hold on. */
      holdKey: CINE.intro.holdKey,

      // Offset from the bow to the close-up camera, in the hero's own frame:
      // out in front, to his sword-arm side, slightly above hand height.
      handForward: CINE.intro.handForward,
      handRight: CINE.intro.handRight,
      handUp: CINE.intro.handUp,

      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      hands: new THREE.Vector3(),

      // Control points, rebuilt each frame from live positions.
      camPts: [],
      lookPts: [],
      // Cumulative arc-length tables, same length as the sample count below.
      camLut: new Float64Array(ARC_SAMPLES + 1),
      lookLut: new Float64Array(ARC_SAMPLES + 1),
    };
    this._introSkipRequested = false;

    for (let i = 0; i < INTRO_CAM_KEYS.length; i++) {
      this.intro.camPts.push(new THREE.Vector3());
      this.intro.lookPts.push(new THREE.Vector3());
    }
  }

  /**
   * Advances the opening take. Returns false once it is finished, so the caller
   * hands back to the normal follow camera.
   */
  _updateIntro(dt) {
    const i = this.intro;
    i.t += dt;

    // Keep the follow pose warm underneath so the landing is seamless even if
    // the player has already started running.
    const follow = this._computeFollowPose(dt);

    const skippable = i.duration - i.skipWindow;
    if (i.t > i.skipGrace && i.t < skippable && this._introSkipRequested) {
      i.t = skippable;
    }
    const time = i.t;

    const hero = this.player.root.position;

    // --- Live anchors ------------------------------------------------------
    // The bow's world position IS his hands, and the close-up offset is applied
    // in his own facing frame, so this tracks him even if he has turned.
    this.player.parts.bow.getWorldPosition(i.hands);

    const facing = this.player.facing;
    const fwdX = Math.sin(facing), fwdZ = Math.cos(facing);
    const rightX = Math.cos(facing), rightZ = -Math.sin(facing);

    const handCam = this._camScratch.set(
      i.hands.x + fwdX * i.handForward + rightX * i.handRight,
      i.hands.y + i.handUp,
      i.hands.z + fwdZ * i.handForward + rightZ * i.handRight
    );

    // --- Rebuild the control points from those live anchors ----------------
    // Polar placement around the hero; angle 0 is straight behind him, which is
    // where the gameplay camera sits.
    for (let k = 0; k < INTRO_CAM_KEYS.length; k++) {
      const key = INTRO_CAM_KEYS[k];
      const p = i.camPts[k];
      const l = i.lookPts[k];

      if (key.from === 'hands') {
        p.copy(handCam);
        l.set(i.hands.x, i.hands.y + 0.18, i.hands.z);
      } else if (key.from === 'follow') {
        p.copy(follow.pos);
        l.copy(follow.look);
      } else {
        p.set(
          hero.x + Math.sin(key.angle) * key.radius,
          key.height,
          hero.z + Math.cos(key.angle) * key.radius
        );
        l.set(hero.x, key.lookY, hero.z);
      }
    }

    // --- Evaluate: one eased parameter across the whole path ---------------
    /*
     * The eased parameter is treated as *distance along the curve*, not as the
     * spline's own parameter. That distinction is the whole trick: a spline's
     * native parameter advances per segment, so uneven control-point spacing and
     * short tangents at corners make the camera surge and crawl. Mapping through
     * a cumulative arc-length table means the speed is set purely by the ease
     * curve, so the move holds a smooth pace through every waypoint — including
     * the bow close-up, which is where a dip is most obvious.
     */
    buildArcTable(i.camPts, i.camLut);

    // Where along the path the bow close-up sits, as a fraction of arc length.
    // Catmull-Rom spreads n control points evenly across the spline parameter,
    // so control point `holdKey` lives at u = holdKey / (n - 1); read its
    // cumulative distance straight out of the table we just built.
    const nPts = i.camPts.length;
    const totalLen = i.camLut[ARC_SAMPLES] || 1;
    const holdFrac = clamp(
      i.camLut[Math.round((i.holdKey / (nPts - 1)) * ARC_SAMPLES)] / totalLen,
      0,
      1
    );

    // Time -> distance, with a stationary hold on the bow. The take is split
    // into two eased moves either side of the hold; because easeInOut has zero
    // derivative at both ends, the camera glides to a stop exactly as it
    // arrives and eases back out, so the pause reads as deliberate, not a stall.
    const moveTotal = Math.max(i.duration - i.holdDuration, 0.0001);
    const moveA = Math.max(moveTotal * holdFrac, 0.0001);
    const moveB = Math.max(moveTotal * (1 - holdFrac), 0.0001);
    const tHold0 = moveA;
    const tHold1 = moveA + i.holdDuration;

    let d;
    if (time <= tHold0) {
      d = easeInOut(clamp(time / moveA, 0, 1)) * holdFrac;
    } else if (time <= tHold1) {
      d = holdFrac; // dead stop, framed on the bow
    } else {
      d = holdFrac + easeInOut(clamp((time - tHold1) / moveB, 0, 1)) * (1 - holdFrac);
    }

    catmullRom(i.pos, i.camPts, arcToParam(i.camLut, d));

    buildArcTable(i.lookPts, i.lookLut);
    catmullRom(i.look, i.lookPts, arcToParam(i.lookLut, d));

    this.camera.position.copy(i.pos);
    this.camera.lookAt(i.look);

    if (time >= i.duration) {
      this.intro = null;
      this._introSkipRequested = false;
      return false;
    }
    return true;
  }

  /** Keep the shadow frustum tight around the action. */
  _updateSun() {
    // Watch whatever the camera is actually framed on: the hero in play, the
    // fallen keep during the defeat sweep.
    const p = this.keep.isDestroyed ? _KEEP_CENTRE : this.player.root.position;
    this.sun.position.set(
      p.x + this.sunOffset.x,
      this.sunOffset.y,
      p.z + this.sunOffset.z
    );
    this.sun.target.position.set(p.x, 0, p.z);
    this.sun.target.updateMatrixWorld();
  }

  _endGame(title, subtitle, cause = 'hero') {
    if (this.state === 'over') return;
    this.state = 'over';
    this.intro = null;
    this.input.release();
    this.waves.stop();
    this.sfx.gameOver();
    this.cancelPlacement();
    this.closeBuildMenu();
    this.hud.setPrompt(null);

    const s = this.stats;
    this.hud.el.goTitle.textContent = title;
    this.hud.el.goStats.innerHTML =
      `${subtitle}<br />` +
      `<b>${s.waves}</b> waves survived · <b>${s.kills}</b> kills · ` +
      `<b>${s.towers}</b> towers · <b>${s.bombards}</b> bombards · <b>${s.catapults}</b> catapults · <b>${s.quarries}</b> quarries · <b>${s.walls}</b> walls · <b>${s.coins}</b> coins looted<br />` +
      `<b>${s.wood}</b> wood chopped · <b>${s.stone}</b> stone cut · <b>${s.repairs}</b> repairs`;

    // When the keep is what fell, hold the summary back until the defeat sweep
    // has shown the walls come down. Otherwise the hero's death keeps the old
    // framing and the screen drops straight away.
    if (cause === 'keep') this._beginDefeat();
    else this.hud.showGameOver(true);
  }

  /* ------------------------------------------------------------------ *
   * Defeat sweep
   * ------------------------------------------------------------------ */

  /**
   * Arms the defeat camera. When the keep comes down we cut away from the hero
   * and circle the castle the way the opening screen does, holding on it while
   * the walls give way — so a run ends framed like it began. The orbit picks up
   * from the camera's current bearing around the keep, so the move reads as a
   * continuation of where the player was already looking rather than a cut.
   */
  _beginDefeat() {
    const cam = this.camera.position;
    this.defeat = {
      t: 0,
      angle: Math.atan2(cam.x, cam.z),
      radius: Math.max(14, Math.hypot(cam.x, cam.z)),
      height: Math.max(16, cam.y),
      /** Total travel before the orbit settles into the slow menu circle. */
      duration: KEEP.collapseTime + CINE.defeat.durationPad,
      /** Summary shown once, at the end of the sweep. */
      shown: false,
    };
  }

  /**
   * Runs the defeat sweep. It never really ends — once the castle has fallen we
   * keep circling the ruin like the menu backdrop — it just drops the summary
   * in and hands the framing back when the move has settled.
   */
  _updateDefeat(dt) {
    const d = this.defeat;
    if (!d) {
      // Shouldn't happen, but fall back to the idle orbit if it ever does.
      this._updateMenuOrbit(dt);
      return;
    }

    d.t += dt;
    // Steady bearing travel around the keep; radius and height ease in toward
    // the menu's framing so the two shots match.
    const D = CINE.defeat;
    d.angle += dt * D.bearing / d.duration;
    d.radius = damp(d.radius, D.radius, D.damp, dt);
    d.height = damp(d.height, D.height, D.damp, dt);

    // The castle shudders into its plaza; kick the camera accordingly, fading
    // out as the ruin settles.
    const kick = Math.max(0, 1 - d.t / (KEEP.collapseTime + 0.8)) * D.kick;
    this.camera.position.set(
      Math.sin(d.angle) * d.radius + (Math.random() - 0.5) * kick,
      d.height + (Math.random() - 0.5) * kick,
      Math.cos(d.angle) * d.radius + (Math.random() - 0.5) * kick
    );
    this.camera.lookAt(D.look.x, D.look.y, D.look.z);

    if (!d.shown && d.t >= d.duration) {
      d.shown = true;
      this.hud.showGameOver(true);
    }
  }

  /** The menu's slow circle around the keep — reused as the settled end shot. */
  _updateMenuOrbit(dt) {
    this._menuTime = (this._menuTime ?? 0) + dt;
    const t = this._menuTime * CINE.menu.orbitSpeed;
    this.camera.position.set(Math.sin(t) * CINE.menu.radius, CINE.menu.height, Math.cos(t) * CINE.menu.radius);
    this.camera.lookAt(CINE.menu.look.x, CINE.menu.look.y, CINE.menu.look.z);
  }

  dispose() {
    cancelAnimationFrame(this._frameHandle);
    window.removeEventListener('resize', this._onResize);
    this.input.release();
    this.renderer.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Camera-path helpers for the opening take
 * ------------------------------------------------------------------ */

/**
 * Control points for the opening take, placed in polar terms around the hero.
 * `angle` 0 is straight behind him, which is where the gameplay camera sits, so
 * the take naturally lands on the gameplay framing at the end.
 *
 * The spacing matters: uniform Catmull-Rom advances one segment per unit of
 * parameter regardless of how long that segment is, so wildly uneven gaps make
 * the camera crawl through the short ones and bolt through the long ones. These
 * are laid out roughly 13-21 units apart, which keeps the pace even.
 *
 * `from: 'hands'` and `from: 'follow'` are resolved live each frame.
 *
 * The points themselves live in `CINE.intro.camKeys` (config.js):
 *   - A single sweep: the camera walks steadily around the hero (the angle only
 *     ever decreases, z only ever increases) while dipping down to his hands and
 *     rising again. Keeping the angle and z monotone is what removes the corners
 *     — a spline turns its speed down at any control point where the path
 *     doubles back on itself, and that reads as a second shot starting.
 *   - The one non-monotone value is height: the camera has to come down to hand
 *     level. The neighbours above and below stay wide so the curve keeps a
 *     strong mostly-horizontal tangent there and sweeps past the bow at speed.
 */
const INTRO_CAM_KEYS = CINE.intro.camKeys;

/** Cubic ease-in-out: slow start, quick middle, gentle stop. */
function easeInOut(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Centripetal Catmull-Rom spline through `pts`, with `u` running 0..1 over the
 * whole path.
 *
 * Centripetal (alpha = 0.5) rather than uniform parameterisation: it derives the
 * tangents from the actual spacing between points, so wildly uneven gaps don't
 * make the camera lurch through the long segments and crawl through the short
 * ones. It is also C1 continuous, so the curve passes through every control point
 * — including the bow close-up — without the tangent ever breaking.
 */
function catmullRom(out, pts, u01) {
  const n = pts.length;
  const span = n - 1;
  const seg = Math.min(n - 2, Math.max(0, Math.floor(u01 * span)));
  const f = clamp(u01 * span - seg, 0, 1);

  const p0 = pts[Math.max(0, seg - 1)];
  const p1 = pts[seg];
  const p2 = pts[seg + 1];
  const p3 = pts[Math.min(n - 1, seg + 2)];

  // Centripetal knots: spacing raised to the power 0.5.
  const w = (a, b) => Math.sqrt(Math.max(1e-4, a.distanceTo(b)));
  const t0 = 0;
  const t1 = t0 + w(p0, p1);
  const t2 = t1 + w(p1, p2);
  const t3 = t2 + w(p2, p3);
  const t = t1 + (t2 - t1) * f;

  // Nested linear interpolations, the standard Barry-Goldman formulation.
  const mix = (a, b, ta, tb) => {
    const d = Math.max(1e-6, tb - ta);
    const k = clamp((t - ta) / d, 0, 1);
    return a * (1 - k) + b * k;
  };

  const ax = mix(p0.x, p1.x, t0, t1), ay = mix(p0.y, p1.y, t0, t1), az = mix(p0.z, p1.z, t0, t1);
  const bx = mix(p1.x, p2.x, t1, t2), by = mix(p1.y, p2.y, t1, t2), bz = mix(p1.z, p2.z, t1, t2);
  const cx = mix(p2.x, p3.x, t2, t3), cy = mix(p2.y, p3.y, t2, t3), cz = mix(p2.z, p3.z, t2, t3);

  const dx = mix(ax, bx, t0, t2), dy = mix(ay, by, t0, t2), dz = mix(az, bz, t0, t2);
  const ex = mix(bx, cx, t1, t3), ey = mix(by, cy, t1, t3), ez = mix(bz, cz, t1, t3);

  out.set(mix(dx, ex, t1, t2), mix(dy, ey, t1, t2), mix(dz, ez, t1, t2));
  return out;
}

/** Resolution of the intro's arc-length tables. */
const ARC_SAMPLES = CINE.intro.arcSamples;
/** Scratch for building those tables. */
const _arcTmp = new THREE.Vector3();

/**
 * Fills `lut` with the *normalised* cumulative arc length of the spline through
 * `pts`, sampled at ARC_SAMPLES + 1 evenly spaced spline parameters.
 *
 * Rebuilt every frame because the control points track the live hero, but at 220
 * samples across 7 points that is a trivial amount of work.
 */
function buildArcTable(pts, lut) {
  let total = 0;
  let prevX = 0, prevY = 0, prevZ = 0;

  for (let k = 0; k <= ARC_SAMPLES; k++) {
    catmullRom(_arcTmp, pts, k / ARC_SAMPLES);
    if (k > 0) {
      total += Math.hypot(_arcTmp.x - prevX, _arcTmp.y - prevY, _arcTmp.z - prevZ);
    }
    prevX = _arcTmp.x;
    prevY = _arcTmp.y;
    prevZ = _arcTmp.z;
    lut[k] = total;
  }

  const inv = total > 1e-6 ? 1 / total : 0;
  for (let k = 0; k <= ARC_SAMPLES; k++) lut[k] *= inv;
  return lut;
}

/**
 * Converts a normalised distance along the curve (0..1) into the spline
 * parameter that reaches it, by binary-searching the arc-length table.
 */
function arcToParam(lut, distance) {
  const d = clamp(distance, 0, 1);

  let lo = 0;
  let hi = ARC_SAMPLES;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lut[mid] < d) lo = mid + 1;
    else hi = mid;
  }

  const i = Math.max(1, lo);
  const d0 = lut[i - 1];
  const d1 = lut[i];
  const f = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  return (i - 1 + f) / ARC_SAMPLES;
}
