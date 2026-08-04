# Rooms — durable state for the third iteration

A new mode, built alongside the existing game rather than on top of it. This
file is to the `rooms` branch what `NIGHT_RUN.md` is to `main` and `UI_NIGHT.md`
is to `ui-polish`: the memory that survives a summarised context.

## Why this exists

Two things came out of playing the current build.

**Chips × mult has to go.** It is the most recognisably Balatro thing in the
game, and it sits badly in an open 2D format: a product of two resources wants a
row of scoring slots, not a map you explore. The measurements agree from a
different direction — the mult axis was never healthy (29% live under poker,
44% under cribbage), and the one variant that gave the player control over which
axis their strong line fed **collapsed it to 12%**, because they routed
everything into chips. The split was never carrying the game.

**The hex board is the good part.** It is the only structure that felt like
exploration rather than a puzzle box, and it had the widest honest skill
separation measured (×5.36). Its known flaw is a choice spread of 15.5: most
hexes are near-dead and a few are enormous, so you farm one rich pocket and
ignore the rest of the map.

The room design is aimed squarely at that flaw. Requiring both **reach** (your
structure must touch an exit) and **score** (clear the room's threshold) puts
two orthogonal pressures on placement, so a rich pocket is no longer sufficient
— you have to go somewhere. Bonus tiles then make specific *positions* valuable
instead of specific *lines*, which is what a map should do.

## The decision everything else rests on

**Scoring becomes additive, and the multiplier moves onto the board.**

- A placement joins up to three hex lines. Each line is counted, and the
  placement scores the **sum** of those counts. No second resource, no product.
- Multipliers still exist, but only as **tiles**: Scrabble-style squares that
  double a card's contribution or a line's total. Finite, spatial, discovered.
- Counting stays cribbage by default — fifteens, pairs, runs, flushes — because
  additive counting is the thing that measured well (lookahead lift 1.26–1.43
  against poker's 1.06–1.19). Additive scoring and an additive counter finally
  agree with each other.

That is the whole difference in one line: **Balatro multiplies resources, this
multiplies places.**

## Pre-declared decisions

Taken so nothing stalls overnight. Any of these can be overridden.

| Question | Default |
|---|---|
| Existing game | **Untouched.** Rooms is a new mode beside it; the 30 rulesets and their measured data are the evidence base and stay working. |
| Score model | Sum of line counts. No chips, no mult, no product anywhere in the core. |
| Multipliers | Board features only. If it multiplies, it is a tile or an item, never a track. |
| Default counter | Cribbage. Poker available as a second, combinable counter. |
| Multiple counters | Additive across counters — a line under cribbage+poker scores both, summed. |
| Room exit | Reach an exit tile **and** meet the room's score threshold. Both, always. |
| What persists between rooms | Deck, inventory, running total. Placement budget is per-room. |
| Jokers | Not a primary modifier. Items are tools that change *rules* (sight, movement, counting), not stacked score multipliers. |
| Room shape | Data, not procedural, until item 19. Hand-authored shapes are debuggable; generation is not. |
| Failure | Running out of placements without clearing = run over. No partial credit for a room. |

## What transfers and what does not

**Transfers.** The hex geometry and its tests (`hex/coords.ts`, `hex/board.ts`
line extraction), the cribbage counter and its 41 tests, the `Structure`
interface and `createEngine`, the whole drag/preview/targeting UI, the smoke
test.

**Void the moment scoring changes.** Every calibrated `targetScore`, every row
in `metrics.generated.ts`, and the entire Metrics page. A room threshold is a
different quantity from a run target and cannot be inherited. **Do not tune a
room by eye** — item 3 rebuilds the probe first, for exactly the reason the
project has already had to void published numbers twice.

**Retired.** `AxisRole`, and the `chips`/`mult` fields on `ScoredPlacement`.
This is the one genuinely invasive change and it is why it is item 1: everything
downstream is easier once a placement has a single score.

## Architecture

The spine does not change: place a card → it joins lines → the lines score.
What is new is a layer *above* the run.

```
Expedition            deck, inventory, room graph, running total   (new)
  └─ Room             board + tiles + threshold + exits            (new)
       └─ HexBoard    ReadonlyMap<"q,r", Card>                     (exists)
       └─ TileMap     ReadonlyMap<"q,r", Tile>                     (new, parallel)
```

`HexBoard` is already a sparse map keyed by `"q,r"`, so tiles are a second map
with the same keys rather than a change to the board type. That keeps every
existing hex function working untouched.

## Standing rules

- **Never break the existing game.** `npm test` covers it and `npm run smoke`
  drives it. Rooms is additive; if an item seems to require changing how the
  current modes score, it is the wrong item — note it and take the next one.
  The one sanctioned exception is item 1, which is scoped and tested.
- **Extend the smoke test with each item.** By the end there must be a rooms
  path through it — enter a room, place, hit a tile, clear, move on. An
  unattended run with no end-to-end check is how a silent break ships.
- Every new scorer, tile effect or item effect gets unit tests before the item
  counts as done. A silent bug in a scorer invalidates the playtest it exists
  to inform — this has bitten the project before.
- **Calibrate from the probe, never by eye.** After item 3 there is a working
  measurement; before it, do not tune anything.
- One item per firing, finished and playable. Items are sized for a 30-minute
  firing; if one is running long, ship the smaller honest version and note what
  was left.
- Never run the old `npm run probe` expecting meaning — it measures the old
  score model until item 3 replaces it.

## Backlog

Ordered so each item leaves the game playable and the next one has something to
stand on. Sized for 30 minutes each.

### A. The scoring change — everything depends on this

- [ ] **1. Collapse chips × mult into one additive score.** `Lens.evaluate`
      returns points, not a role-dependent value; `ScoredPlacement` carries
      `score` and drops `chips`/`mult`; `AxisRole` is deleted. Grid and hex both
      keep working — grid sums its two lines, hex its three. Update the preview,
      the log and the existing rulesets' targets to whatever the sum produces
      (they will be wrong; item 3 fixes them properly). Tests updated, not
      deleted.
- [ ] **2. Multiple counters at once.** An active counter *set* rather than one
      lens. A line's points are the sum across active counters. Ship
      cribbage+poker as a selectable combination and prove in a test that a line
      scoring under both gets both.
- [ ] **3. Rebuild the probe for the new model.** Greedy / random / two-ply
      still apply, but mult participation is meaningless now. Replace it with:
      **reach pressure** (how often the best-scoring move is away from the
      exit), **spread** (kept — it is the metric the room design is trying to
      fix), and **clear rate**. Regenerate `metrics.generated.ts` and recalibrate
      the existing rulesets' targets against the additive model.

### B. The room shell

- [ ] **4. Room as a bounded region.** A `Room` is a set of legal hex
      coordinates plus a border, replacing "everything within radius N". Two
      hand-authored shapes to start. Rendering follows the shape.
- [ ] **5. Exit tiles and the reach condition.** Mark border hexes as exits;
      compute whether the placed structure connects to one. Show reached/not
      reached. This is pure geometry — it wants a proper test, including a
      structure that touches the border but not at an exit.
- [ ] **6. Room threshold and clearing.** Clear = reached an exit **and** score
      ≥ threshold. A room-end state showing both conditions separately, so a
      near-miss reads as "you got there but were short" rather than just "lost".
- [ ] **7. Two rooms joined.** Leave through an exit, arrive in the next room
      with your deck intact and a fresh placement budget. Running total carries;
      per-room score resets. This is the first moment the mode is the thing the
      brief describes.

### C. Tiles

- [ ] **8. The tile layer.** `TileMap` parallel to `HexBoard`, a `Tile` union,
      rendering underneath cards so a placed card does not hide what it landed
      on. No effects yet — this item is the substrate and its tests.
- [ ] **9. Bonus tiles: card multipliers.** Double or triple the placed card's
      own contribution to every line through it. The Scrabble letter square.
- [ ] **10. Bonus tiles: line multipliers.** Double the total of one line
      through the tile. The Scrabble word square, and a different decision —
      letter squares reward a big card, word squares reward a big line.
- [ ] **11. Blocked tiles.** Rubble that cannot be placed on, so a room's shape
      can constrain routes rather than just bound them. Cheap, and it makes
      reach a real problem.
- [ ] **12. Traps.** Placing on or beside one costs you a card from hand or
      deck. Revealed on trigger; hidden before. Test the deck accounting
      carefully — silently losing the wrong card is the worst class of bug here.
- [ ] **13. Artifact cards.** A card sitting on the board that joins your deck
      when your structure connects to it. The reason to detour.

### D. What you carry

- [ ] **14. Inventory and the effect hook.** An items list on the Expedition and
      one place where item effects apply. No items yet — substrate and tests.
- [ ] **15. Item: a second counter.** Grants a counting method for the rest of
      the run, using item 2's machinery. The clearest expression of "carried
      items may let you switch or combine scoring methods".
- [ ] **16. Item: sight.** See the next room's shape, or reveal this room's
      hidden tiles. Changes decisions without touching score, which is the point
      of keeping items away from multipliers.
- [ ] **17. Item: reach.** Something that helps the spatial condition — place
      one card unconnected, or extend from a second origin. Reach and score are
      the two exit conditions; items should be able to address either.
- [ ] **18. Temporary versus permanent.** Some bonuses last a room, some last
      the expedition. Make the distinction visible in the UI before there are
      enough effects for it to get confusing.

### E. Variety and calibration

- [ ] **19. Room archetypes.** Rooms that differ in active counters, tile
      density and threshold. This is where "Hearts world" style variety lives —
      as a room property, not a separate build.
- [ ] **20. Seeded room generation.** Shapes, tiles and exits from a seed, with
      the hand-authored rooms kept as fixtures so failures stay reproducible.
- [ ] **21. Room graph and route choice.** More than one exit, leading to
      different next rooms, with something known about each before you commit.
- [ ] **22. Calibration pass.** Probe every archetype, set thresholds from
      measured medians, and record the numbers. Explicitly check whether the
      choice spread has come down from the hex sprawl's 15.5 — that is the
      question this whole design was built to answer.
- [ ] **23. Metrics for rooms.** Rebuild the Metrics page around clear rate,
      reach pressure and spread, with the old hex sprawl as the reference line
      the way Poker Squares was before.

## Where things live

- **Branch**: `rooms`. Same merge-down loop as `ui-polish` — each firing merges
  `origin/main` in first, so the branches never diverge by more than one firing
  and the eventual merge back is nearly a fast-forward. If that merge conflicts,
  **stop and report**; do not resolve it.
- **Artifact**: minted on the first firing. Record the URL here and pass it as
  `url` every time after. **Never publish to the artifact on `main`**
  (`6613c961-31a5-4a7b-8c61-abeb633d25e6`) — that is the build being played.
- **Build**: `npx vite build`, then inline `dist/assets/*.css` and `*.js` into a
  single body-only HTML file. Nothing may reference an external host.
- **Browser**: `import { launch } from './tools/browser.mjs'`. Never run
  `playwright install`. Scripts must live inside the repo.
- **Commit signatures are fine.** A SessionStart hook configures verification.
  If one reads as missing or bad the fault is in that setup — run
  `python3 tools/setup-signing.py`. Never rewrite history over it.

## Decisions log

Record anything a later firing would otherwise rediscover, and anything that
turned out wrong once it was running. A note that an idea failed is worth as
much as one that landed.

## Results log

Per item: what shipped, what it measures, and a capture path. For anything with
a score in it, record the numbers — this mode has no calibrated baseline yet and
the log is how one accumulates.
