# Kingshot Lite — Hold the Keep

A semi-3D (isometric, tilted top-down) medieval castle-defence game in the spirit
of the "what the ad shows vs. what the game is" style of mobile strategy ads —
except this one actually plays like the ad.

You are a lone archer with a keep to protect. Enemies march in from four gates,
you loose arrows at them, they **throw coins** on death, you run over the coins to
bank them, and you spend those coins on **archer towers** so you can hold the line
without doing everything yourself.

The keep and your towers both take damage and both are mended with **wood**
chopped from the trees around the map. Leaving the keep to forage is exactly when
it's most exposed — that tension is the point.

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
| Interact | Walk up to something, then press `E` / `Space`, or tap the context button |

One button covers every verb — **build** a tower, **upgrade** it, **chop** a
tree, **repair** the keep, or **repair** a battered tower. The game picks whichever
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
stand on a build pad  →  spend coins on an archer tower (or upgrade one)
        ↓
keep or tower taking damage?  →  chop trees for wood  →  repair them
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

Four build pads ring the keep at a fixed radius. Each raises a **square stone
tower**, modelled after the reference art: a stocky two-stage body of weathered
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
Prices escalate as you build (`40 → 60 → 80 → 100`), so you can't buy four at once.

Each tower has three tiers you can buy in place:

| Tier | Damage | Fire rate | Range | Health |
| --- | --- | --- | --- | --- |
| 1 | 15 | 0.85 /s | 11.5 | 140 |
| 2 | 24 | 1.05 /s | 13.0 | 210 |
| 3 | 36 | 1.25 /s | 14.5 | 300 |

Towers lead their targets and only loose once roughly on-target.

### Towers take damage

A tower is a living structure. Enemies besiege it, it flashes and shows a health
bar as it drops, and at **zero health it topples over**, fades into rubble, and
frees its pad.

Enemies chip towers at `TOWER.damageTakenScale` (**0.6×**) — they're hacking at
timber, and without that reduction a pair of grunts would level a tower before the
hero could cross the map to defend it.

### Rebuilding

Rubble is not a total loss. The pad reopens showing the wreckage at a **50%
discount** (`REPAIR.rebuildDiscount`) — holding the line is rewarded, losing a
tower isn't a catastrophe.

## Wood & repairs

**Coins build things; wood mends them.** Keeping that split means you always know
which resource answers which problem.

Trees are the only renewable source of wood. Each one takes **3 chops** to fell
(a segmented bar above the trunk shows progress), yields **1 wood per chop**, and
then topples, leaves a stump, and **regrows after 30 seconds** — so the map never
runs out and a long run can't soft-lock.

Wood repairs three things, all through the same verb:

| Target | Effect |
| --- | --- |
| Keep | 1 wood → **+12** keep health |
| Archer tower | 1 wood → **+45** tower health |

Standing next to a damaged structure offers the repair. Because a repair is an
*emergency* and an upgrade is a *luxury*, repairs outrank upgrades even when both
apply to the same pad (see the priority table in `Game.PRIORITY`).

The wood chip in the HUD pulses green once the keep is hurt, and repairs flash the
structure green so the feedback reads instantly.

All of it is tuned in `config.js` under `TREE` and `REPAIR`:

| Knob | Default | Effect |
| --- | --- | --- |
| `TREE.chops` | 3 | Swings to fell one tree |
| `TREE.woodPerChop` | 1 | Wood per swing |
| `TREE.respawnTime` | 30 s | Regrowth delay |
| `REPAIR.woodCost` | 1 | Wood per repair action |
| `REPAIR.healAmount` | 12 | Keep health restored |
| `REPAIR.towerHealAmount` | 45 | Tower health restored |
| `REPAIR.towerRange` | 3.6 | How close you must stand to a tower |
| `REPAIR.rebuildDiscount` | 0.5 | Price of rebuilding rubble |

## Project layout

```
src/
  main.js                 entry point
  style.css               HUD / overlay styling
  game/
    config.js             ← ALL balance numbers live here
    Game.js               orchestrator: scene, loop, systems, waves, win/lose
    World.js              terrain, lanes, cliffs, spawn gates, scenery colliders
    models.js             low-poly builders (rigs with bows, keep, stone tower, props)
    Player.js             archer: movement, auto-aim, bow draw, health/regen
    Enemy.js              the three archetypes + targeting, attacks, health bars
    Tower.js              stone tower: aiming, firing, health, collapse, repair
    BuildPad.js           dashed build sites, cost badges, rubble, interaction state
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
