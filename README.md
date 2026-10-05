# Kingshot Lite — Hold the Keep

A semi-3D (isometric, tilted top-down) medieval castle-defence game in the spirit
of the "what the ad shows vs. what the game is" style of mobile strategy ads —
except this one actually plays like the ad.

You are a lone archer with a keep to protect. Enemies march in from four gates,
you loose arrows at them, they **throw coins** on death, you run over the coins to
bank them, and you spend those coins on **structures you raise anywhere on the
map** — archer towers to hold the line, and stone quarries to cut the masonry
they are built from.

Nothing is bolted to a fixed plot. Open the build list, pick a structure, and site
it wherever the ground is clear. **Coins** pay for the work, **stone** (cut at a
quarry) is the masonry, and **wood** (chopped from the trees) patches damage —
leaving your buildings to forage is exactly when they're most exposed.

**There are no guns in this world.** The hero draws a longbow, the towers are
stone and loose arrows from their windows, and every sound is a bowstring, a
thud, or splintering timber.

![style: chunky low-poly, saturated greens, warm dirt paths](https://img.shields.io/badge/style-low--poly%20isometric-63b845)

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production bundle -> dist/
npm run preview  # serve the built bundle
```

## Controls

| Action | Input |
| --- | --- |
| Move | `WASD` / arrow keys, **or** drag anywhere on the screen (virtual joystick) |
| Loose | Automatic — the archer draws and fires at the best target in range |
| Build | The build list is docked on the left, collapsed to an icon rail by default — tap an icon (or `›`) to build |
| Interact | Press `E` / `Space`, or tap the context button — places, upgrades, chops or repairs |
| Tuck away | `B`, or the `‹` handle on the panel, collapses it to an icon-only rail |
| Cancel | `Q` / `X` / `Esc`, or tap **CANCEL PLACEMENT** while placing |

The build list is data-driven (see `buildings.js`), and placement is free: a
translucent **ghost** follows the hero, tinted green where the ground is clear and
red where it isn't. The single action button then covers every verb — **place**
the structure you're siting, **upgrade** one you're standing beside, **chop** a
tree, or **repair** the keep or a battered building. The game picks whichever
matters most, and the button always says what it will do.

The archer has a cone-weighted auto-aim: enemies in front are preferred over ones
behind, and he leads his shots so runners can't simply outrun the arrow.

## The loop

```
wave prep (callout) → enemies spawn from a gate
        ↓
archer looses arrows  →  they throw coins (physics arcs + bounce)
        ↓
hero walks over coins  →  purse grows
        ↓
open the build list  →  pick a tower or quarry  →  place it anywhere clear
        ↓
quarry cuts stone  →  towers cost coins + stone; repairs cost wood + stone
        ↓
keep or building taking damage?  →  chop trees for wood  →  repair them
        ↓
wave cleared → bonus coins + a little keep repair → next wave
```

A small passive income drips out of the keep every few seconds, so a bad wave
can never hard-lock the run. Waves 3 and beyond also drop a free wood on clear.

## Enemies

Three archetypes, each with a distinct answer:

| | Grunt | Runner | Brute |
| --- | --- | --- | --- |
| Look | orange, spiked helmet | purple, hooded, hunched | big red, horns, shoulder pads |
| Health | 34 | 46 | 145 |
| Speed | 2.9 | **5.0** | 1.65 |
| Damage / hit | 6 | 10 | 20 |
| Drops | 3 coins ×2 = **6** | 4 coins ×2 = **8** | 6 coins ×3 = **18** |
| Threat cost | 1 | 2 | 3 |
| Counter | anything | towers + kiting; don't let it slip past | focus fire, upgraded towers |

Waves are built by spending a **threat budget**, so the roster and the mix change
as the game ramps. After the hand-authored wave table is exhausted, waves are
generated procedurally (bigger budget, faster spawn gap, scaling health/speed).

### How they pick a target

1. **A tower they're already beside** — they stop and hack it down. Towers are real
   obstacles, not scenery, so a tower planted in a lane genuinely blocks it.
2. **The hero**, if he's in their face and closer than the keep.
3. **The keep**, otherwise.

They also fan out so they don't collapse into a single conga line, and are shove-
resistant so bullets (sorry, arrows) feel like they land.

## Archer towers

An archer tower can be raised anywhere on the map (see *Build list & placement*
below). It is a **square stone tower**, modelled after the reference art: a stocky
two-stage body of weathered
stone banded with protruding courses, a big **arched window on every face** of
the upper stage, **three narrow arched slits** through the lower stage, an arched
**wooden door** at the foot, **moss** creeping up the shaded stonework, tumbled
rubble around the base, and a broad **shingled pyramid roof** with overhanging
eaves and a finial.

**There is no weapon on the tower.** It is masonry through and through — no
ballista, no timber mounting, no banners. Arrows are loosed straight out of the
arched windows and dust puffs off the stonework on each shot. The tower still
aims properly (see the architecture notes) because it keeps an *invisible* aiming
rig: the yaw and pitch groups and the muzzle anchor are pure transforms with no
meshes attached, so the firing code never has to know there's nothing up there.

Upgrading makes the tower visibly taller, so the investment reads at a glance.
Prices escalate as you build (`40 → 60 → 80 → 100` coins, plus `6 → 8 → 10` stone),
so you can't buy a whole row at once.

### Build list & placement

Structures are **not** tied to fixed pads. The build list is docked to the left edge
and starts **collapsed as an icon rail** — one square icon per building. Tap an
icon to start siting it, or the `›` chevron to expand the full detail cards
(icon + name + blurb + price). Picking a structure enters placement mode, where a
translucent ghost is sited at the hero's feet. Walk to a clear spot — the ghost
glows **green** when the site is legal and **red** when it isn't — then press the
action button to place. Placement is rejected inside the keep plaza, on the map
edge, and wherever it would overlap another structure, a standing tree, or
scenery. The `‹` handle (or `B`) collapses the detail back to the icon rail, and
**CANCEL PLACEMENT** (or `Q` / `X` / `Esc`) backs out of siting.

Each tower has three tiers you can buy in place:

| Tier | Damage | Fire rate | Range | Health |
| --- | --- | --- | --- | --- |
| 1 | 15 | 0.85 /s | 11.5 | 140 |
| 2 | 24 | 1.05 /s | 13.0 | 210 |
| 3 | 36 | 1.25 /s | 14.5 | 300 |

Towers lead their targets and only loose once roughly on-target.

### Towers take damage

A tower is a living structure. Enemies besiege it, it flashes and shows a health
bar as it drops, and at **zero health it topples over** and fades from the field.

Enemies chip towers at `TOWER.damageTakenScale` (**0.6×**) — they're hacking at
timber, and without that reduction a pair of grunts would level a tower before the
hero could cross the map to defend it.

### Losing a building

A collapsed structure is removed rather than left as a wreck, and there is no
discounted plot to reclaim. Since placement is free, the answer is to raise a
replacement somewhere clear — but that costs the coins and stone you'd rather
have spent elsewhere, which is the real penalty.

## Stone & quarries

**Coin builds, stone is the masonry, wood mends.** Each resource answers a
different problem.

A **Stone Quarry** is the only source of stone. It costs coins only — stone can't
buy the mine it comes from — so a run can never lock itself out of its own
resource. Once raised it drip-feeds stone every few seconds, and each tier both
deepens the pit and speeds the trickle:

| Tier | Stone per yield | Interval | Health |
| --- | --- | --- | --- |
| 1 | 2 | 6.5 s | 130 |
| 2 | 3 | 5.0 s | 190 |
| 3 | 5 | 4.0 s | 260 |

Stone is spent on **raising and upgrading towers**; every **repair** costs a
little stone as well, so a run with no quarry quickly runs out of the means to
build *or* mend. Quarries are structures like any other: enemies besiege them, and
the hero patches them with wood + stone.

## Stone walls

The **Stone Wall** is the only structure that *connects*. Pieces snap to a shared
3.4-metre grid, and each rebuilds its own shape from whichever neighbours exist —
laying one piece beside another produces straights, corners, T-junctions and ends
automatically, with a solid pillar at every junction. The ghost reshapes as you
walk, so you can see the corner forming before you commit.

A piece that stands **alone** turns to face the keep, presenting its face to the
castle; the moment it joins a run it squares up to the grid so neighbouring
panels meet cleanly. So a scattered ring of blocks all face inward, and a
connected rampart stays true.

Walls are the cheap way to actually *protect* the keep: an enemy that runs into a
rampart besieges it instead of strolling on to the keep, so a continuous line buys
the hero time and the towers clean shots. They block the hero too, so leave a gap
to sally out through. Every piece has its own health — a breach opens exactly
where the stone gave way — and walls do **not** upgrade.

| Knob | Default | Effect |
| --- | --- | --- |
| `WALL.buildCost` / `stoneCost` | 12 / 3 | Flat price per piece |
| `WALL.cell` | 3.4 | Grid pitch pieces snap to |
| `WALL.maxHealth` | 160 | Health per piece |
| `WALL.damageTakenScale` | 0.7 | Enemies chip fieldstone slower than towers |
| `WALL.keepClearance` | 5.0 | How close a wall may ring the keep |

## Wood & repairs

Wood is the patch and stone is the filler. Keeping the split (coins build, wood +
stone mend) means you always know which resource answers which problem.

Trees are the only renewable source of wood. Each one takes **3 chops** to fell
(a segmented bar above the trunk shows progress), yields **1 wood per chop**, and
then topples, leaves a stump, and **regrows after 30 seconds** — so the map never
runs out and a long run can't soft-lock.

Repairs cost wood **+ stone**, all through the same verb:

| Target | Effect |
| --- | --- |
| Keep | 1 wood + 2 stone → **+12** keep health |
| Archer tower | 1 wood + 2 stone → **+45** tower health |
| Stone quarry | 1 wood + 2 stone → **+45** quarry health |
| Stone wall | 1 wood + 2 stone → **+45** wall health |

Standing next to a damaged structure offers the repair. Because a repair is an
*emergency* and an upgrade is a *luxury*, a damaged building always offers repair
first; an upgrade is only offered while it stands at full health (see the
priority table in `Game.PRIORITY`).

The wood chip in the HUD pulses green once the keep is hurt, and repairs flash the
structure green so the feedback reads instantly.

All of it is tuned in `config.js` under `TREE` and `REPAIR`:

| Knob | Default | Effect |
| --- | --- | --- |
| `TREE.chops` | 3 | Swings to fell one tree |
| `TREE.woodPerChop` | 1 | Wood per swing |
| `TREE.respawnTime` | 30 s | Regrowth delay |
| `REPAIR.woodCost` | 1 | Wood per repair action |
| `REPAIR.stoneCost` | 2 | Stone per repair action |
| `REPAIR.healAmount` | 12 | Keep health restored |
| `REPAIR.towerHealAmount` | 45 | Structure health restored |
| `TOWER.stoneCost` / `stoneStep` | 6 / 2 | Stone to raise a tower (escalating) |
| `QUARRY.levels` | — | Stone per yield + interval per tier |
| `BUILD.keepClearance` / `spacing` / `edgeMargin` | 7.8 / 1.3 / 5.0 | Placement constraints |

## Project layout

```
src/
  main.js                 entry point
  style.css               HUD / overlay styling
  game/
    config.js             ← ALL balance numbers live here
    Game.js               orchestrator: scene, loop, systems, waves, win/lose
    World.js              terrain, lanes, cliffs, spawn gates, scenery colliders
    models.js             low-poly builders (rigs with bows, keep, tower, quarry, props)
    buildings.js          buildable catalogue: name, cost, model + live factory
    Player.js             archer: movement, auto-aim, bow draw, health/regen
    Enemy.js              the three archetypes + targeting, attacks, health bars
    Tower.js              stone tower: aiming, firing, health, collapse, repair
    Quarry.js             stone quarry: passive stone yield, health, collapse, repair
    Wall.js               grid-snapped wall piece: neighbour mask, health, collapse
    buildingUtils.js      shared structure health-bar helpers
    Tree.js               choppable trees: chop, topple, stump, regrow
    Keep.js               castle health, damage flash, passive income, collapse
    Coin.js               thrown-coin physics + magnet pickup
    Projectile.js         pooled swept-segment arrows (shaft + head + fletching)
    Effects.js            string snaps, dust puffs, impact sparks, death bursts
    WaveManager.js        prep → spawning → clearing state machine
    Input.js              keyboard + drag-anywhere virtual joystick
    HUD.js                all DOM presentation, floating damage numbers
    Sfx.js                synthesized audio (no asset files)
    utils.js              math, shared materials, canvas label sprites
```

## Architecture notes

**Balance is data, not code.** Every tuning knob — enemy stats, tower tiers,
wave table, prices, camera, hero weapon — lives in `config.js`. Change numbers
there and nothing else needs to move.

**Rig forward is `+Z`.** Character and turret models are authored facing `-Z`
(which is natural for geometry), then a dedicated 180° correction group flips
them so the model's visual front lands on `+Z`. Every facing calculation in the
game uses `rotation.y = atan2(dx, dz)`, which points an object's local `+Z` at
the target. Important: that flip group must never be the group the aiming code
writes to each frame — if it is, the aiming overwrites the correction and the
gun fires backwards. `models.js` keeps the flip on its own parent (`flip` for
characters, `turretRoot` for towers) for exactly this reason.

**Collision is cheap and deliberate.**
- Projectiles use a swept segment vs. sphere test, so bullets can't tunnel even
  at 46 units/second.
- The hero is pushed out of the keep plaza, built towers, tree trunks and
  scenery colliders. Felled trees stop blocking, so a cleared glade is walkable.
- Enemies ignore scenery and walk straight at their goal — no pathfinding needed
  on an open field, and no risk of a NavMesh failure stranding a wave.

**One building block, two weapons.** `buildArrow()` authors a single arrow model
pointing along `+Z`, and it's used for two things: the arrow nocked on the hero's
bowstring, and the pooled projectile. One shape, two users.

**The model reports its own firing height.** `createArcherTower()` returns
`parts.turretHeight` (and `badgeHeight` for the health bar) alongside the usual
`yaw`/`pitch` groups, and the aiming code reads those instead of hard-coding a
number. That matters because the tower *grows* as it is upgraded — a constant
would have quietly mis-aimed every bolt from the second tier onward.

**No weapon, still aims.** The tower mounts nothing, but it keeps the yaw/pitch
pivot chain and a `muzzle` anchor as invisible transforms. Two details make that
work: the muzzle hangs off `yaw` rather than `pitch`, so elevating the aim never
drags the spawn point out of the arched window — only the *direction* pitches;
and `_updateRig()` guards on `parts.bolt`, so a weaponless model and a model with
a mounted weapon are interchangeable without the firing code caring which it has.

**Arches are two cheap meshes.** `archedOpening()` builds a rounded-top opening
as a box plus a half-buried cylinder of the same width. A circle whose radius
matches the rectangle's half-width lines up exactly with its edges, so the union
reads as a true round arch — far cheaper than modelling the curve, and it's
reused for the door, the windows and the arrow slits.

**A tower's collision radius follows its footprint.** Swapping the timber deck
for a stone plinth roughly doubled how much ground a tower occupies, so
`TOWER.blockRadius` (used by besieging enemies) and the hero's push-out radius
both grew with it.

**Bowstrings bend for real.** The longbow models its string as *two* unit boxes,
each pivoted at a nock, scaled to reach the draw point and rotated to aim at it.
So the string genuinely folds into a V as it's drawn rather than sliding a sprite
around. The draw amount itself is derived from the reload timer, which means
loosing a shot resets the cooldown and the string snaps flat on that same frame —
no separate animation state to keep in sync.

**One verb, five meanings.** `Game._interactionCandidates()` gathers everything
the hero could act on and the prompt plus the action button both read from that
single list, so they can never disagree. Candidates carry an explicit **intent
priority** (repair `0` → chop `1` → build `2` → upgrade `3`) because a repair is an
emergency and an upgrade is a luxury; distance only breaks ties within a priority.
Distances are computed from the hero's live position rather than from each
object's cached value — that cached value is written by a *different* system each
frame, and depending on it silently couples the prompt to the order those systems
happen to run in.

**Effects are capped.** Particles are individual meshes for simplicity, but the
pool hard-caps at 320 live particles and throttles new bursts past 220, so a
20-enemy wave can't tank the frame rate.

**Audio is synthesized.** `Sfx.js` builds every sound from oscillators and a
noise buffer at runtime, so the game ships with zero binary assets.

## Known trade-offs / next steps

- Enemies walk straight lines rather than pathfinding around rocks. Fine on an
  open field; would need real navigation if the map gained mazes.
- The map is a single hand-built arena — no procedural level generation.
- No persistence: high scores reset on reload. `localStorage` would be the obvious
  next addition.
- Tower placement is limited to fixed pads (matching the reference art). Free
  placement would need a validity/overlap check and a ghost preview.
