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

- [x] **1. Collapse chips × mult into one additive score.** `Lens.evaluate`
      returns points, not a role-dependent value; `ScoredPlacement` carries
      `score` and drops `chips`/`mult`; `AxisRole` is deleted. Grid and hex both
      keep working — grid sums its two lines, hex its three. Update the preview,
      the log and the existing rulesets' targets to whatever the sum produces
      (they will be wrong; item 3 fixes them properly). Tests updated, not
      deleted.
- [x] **2. Multiple counters at once.** An active counter *set* rather than one
      lens. A line's points are the sum across active counters. Ship
      cribbage+poker as a selectable combination and prove in a test that a line
      scoring under both gets both.
- [x] **3. Rebuild the probe for the new model.** Greedy / random / two-ply
      still apply, but mult participation is meaningless now. Replace it with:
      **reach pressure** (how often the best-scoring move is away from the
      exit), **spread** (kept — it is the metric the room design is trying to
      fix), and **clear rate**. Regenerate `metrics.generated.ts` and recalibrate
      the existing rulesets' targets against the additive model.

### B. The room shell

- [x] **4. Room as a bounded region.** A `Room` is a set of legal hex
      coordinates plus a border, replacing "everything within radius N". Two
      hand-authored shapes to start. Rendering follows the shape.
- [x] **5. Exit tiles and the reach condition.** Mark border hexes as exits;
      compute whether the placed structure connects to one. Show reached/not
      reached. This is pure geometry — it wants a proper test, including a
      structure that touches the border but not at an exit.
- [x] **6. Room threshold and clearing.** Clear = reached an exit **and** score
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
- **Artifact**: https://claude.ai/code/artifact/5a1898dd-dcba-4509-8c6c-867f68bc6a20
  — minted on item 1's firing. Pass this URL as `url` every time after (WebFetch
  it first — publishing 409s unless the current version has been read).
  **Never publish to the artifact on `main`**
  (`6613c961-31a5-4a7b-8c61-abeb633d25e6`) — that is the build being played.
- **Build**: `npx vite build`, then inline `dist/assets/*.css` and `*.js` into a
  single body-only HTML file. Nothing may reference an external host.
- **Browser**: `import { launch } from './tools/browser.mjs'`. Never run
  `playwright install`. Scripts must live inside the repo.
- **Commit signatures are fine.** A SessionStart hook configures verification.
  If one reads as missing or bad the fault is in that setup — run
  `python3 tools/setup-signing.py`. Never rewrite history over it.

## Decisions log

**Item 1.** `Lens.evaluate(cards, cfg)` now returns one `LineEval.value` —
points, not a role-dependent chips-or-mult number. `ScoredLine` dropped
`role`; `ScoredPlacement` dropped `chips`/`mult`, keeping only `score`. Grid
sums `rowLine.value + colLine.value`; hex sums all three axis lines, then
applies the ring bonus to the total (the one multiplier left in the core
model — it acts on the sum, not on a line, so it stayed out of scope for the
retirement). `payOnCompleteOnly`/`lockAndCash` still gate the total with a
0/1 `payout` multiplier — that's a banking gate, not the axis-resource split
being retired, so it stayed as-is.

For cribbage, a line's points are the old "chips" formula (`count ×
chipsPerPoint + baseChipsPerCard × cards.length`); the old "mult" formula
(`1 + floor(count / multPerPoint)`) is gone, and `cribbage.multPerPoint` was
deleted from `Config` since nothing reads it anymore. For poker, a line's
points are the old "chips" formula (`hand.chips + rankTotal`); `hand.mult`
is simply never read by `pokerLens` now, but `HandEntry.mult` stays in
`Config`/`hands.ts`/`evaluateHand` — a different, lower-level concept
(a hand's own reward table) than the retired `AxisRole`, and `hands.test.ts`
still covers it untouched. The Setup screen's per-hand table still lets a
player edit that number, so its column is now labelled "Mult (unused)"
rather than silently doing nothing.

`mechanics.axisMode` ('split' / 'both' / 'suit') existed entirely to route
lines into the chips/mult roles. With roles gone there is nothing left to
route — the config field stays (three live rulesets set it, and the type is
unchanged), but `scoreCross` no longer reads it: every mode now scores
identically, `Row` + `Col` summed. `mech-both-axes`, `mech-suit-axis`,
`mech-free` and `poker-mult-amped` are consequently inert re-skins of their
baselines now; their blurbs say so ("Historical: ...") rather than
describing behaviour that no longer exists. Left them in the ruleset list
rather than deleting — item 3's calibration pass is a better moment to
decide whether they're worth reviving in additive terms (e.g. "both lines
feed a shared bonus tile" is a real Rooms-shaped idea) or retiring outright.

Every existing ruleset's `targetScore` (and `CONFIG.targetScore`) was
recomputed, not hand-guessed: a throwaway greedy-agent script (same shape as
`tools/probe.test.ts`, run and discarded — not committed, not `npm run
probe`) played 20 seeds per ruleset under the new additive model and took
the median final score as the new target, which is what the item's own text
asked for ("update... targets to whatever the sum produces"). This is
**not** the item-3 probe and carries no claim about reach pressure, spread,
or clear rate — it only stops the numbers from being nonsensically stale
(the old products were 3-500x the new sums). One exception: `poker-tight`'s
config is identical to `poker-baseline` except for `targetScore`, so setting
both to their shared median collapsed them to the same `Config` object and
broke `matchingPreset`'s deep-equality lookup (`setup.test.ts`) — gave
`poker-tight` the 80th-percentile score instead, restoring "same rules,
harder bar" as a distinct, still-measured number. `mech-lock-cash` kept
using a 2-ply median rather than greedy, per the existing comment in
`rulesets.ts` — greedy is not a valid agent for that ruleset (it cashes too
early), confirmed by `npm run probe` afterwards showing 0% greedy win rate
there and matching the ruleset's own long-standing note.

Ran `npm run probe` once by hand afterward purely to sanity-check nothing
crashes post-change (it doesn't — `multActive`/`multPct` just read 0
everywhere now, harmless dead code in a script item 3 replaces). That run
regenerated `src/metrics.generated.ts` as a side effect; reverted it with
`git checkout` before committing, since regenerating that file for real is
explicitly item 3's job, not this one's — a half-updated Metrics page
(valid skill/lift numbers next to a permanently-zero `multPct` column) would
be worse than the currently-stale one.

Cascade cell highlighting (`CascadeCell`) dropped its `role` field along
with `AxisRole`; every line now flashes the same sky-blue
(`cascade-flash-chips`, kept its old name to avoid an unnecessary rename).
The unused `cascade-flash-mult` CSS rule was deleted. Same collapse in
`HexBoardView`'s run/window highlighting: the chips-blue/mult-amber `Map`
became a plain `Set`, one colour.

**Item 2.** Kept `lensId` as the primary counter and added one new field,
`secondLensId: string` (empty = no second counter), rather than replacing it
with an array. A pair is what the item actually asks to ship
("cribbage+poker as a selectable combination"), a fixed field slots straight
into `setPath`/`getPath`/`normalise`/`matchingPreset` with no new machinery,
and every one of the 30 existing configs already carries `secondLensId: ''`
for free through `{...CONFIG, ...over}`. `activeLensIds(cfg)` reads back
`[lensId]` or `[lensId, secondLensId]`; nothing stops a future item from
widening it to a real array if a third counter is ever wanted, but nothing
today asks for one.

The actual combination logic is one new function, `combineLenses(lenses):
Lens`, in `src/lens/combine.ts`. It returns the input unchanged when there is
exactly one lens — so `getScoringLens(cfg)` is a strict drop-in replacement
for every `getLens(cfg.lensId)` call site (`board.ts`, `hex/board.ts`,
`App.tsx`, `ScoringPanel.tsx`, `SetupPage.tsx`) and no existing ruleset's
score changes. With more than one lens it sums `.value` across all of them
for `evaluate`, concatenates `.rules()` sections (each retitled with which
lens it came from, e.g. "Cribbage — Counting a line"), and prefixes each
itemised `ScoreItem` label with its lens's name so the preview can still show
"Cribbage: Fifteen" next to "Poker: High Card" rather than one opaque number.
This is the whole of the "counter set" the backlog item describes — the grid
and hex scorers themselves needed zero changes, because they already only
ever call the lens through one `Lens`-shaped seam.

`normalise` gained one rule: a `secondLensId` equal to `lensId` collapses back
to `''`, since scoring a line under the same counter twice would just double
it for no reason and isn't a real combination worth offering. Setup's
lens-specific fields (`cribbage.*`, `partialHands.*`) now show whenever their
lens is *either* slot (`usesLens(cfg, id)`), so picking cribbage as a second
counter surfaces its settings even when poker is primary.

Fixed a leftover bug from item 1 while in the file: `setup.ts` still had a
`cribbage.multPerPoint` field wired to a Setup-screen slider, but item 1
deleted `Config.cribbage.multPerPoint` entirely — the slider was moving a
property that silently vanished into nothing (`setPath` will happily write an
arbitrary key onto an object; the type system never caught it because `Field.path`
is just a string). Deleted the dead field rather than leaving a control that
does nothing.

Shipped the combination as `combo-cribbage-poker` ("Cribbage + Poker") in a
new "Counters" ruleset group, not just as a reachable-but-unlisted Setup
combination — the item says "ship... as a selectable combination", and a
combination nobody can find from the ruleset menu is not really shipped. Its
`targetScore` (1571) is a placeholder from the same throwaway-greedy-script
method item 1 used for its 30 recomputed targets (20 seeds, median, script
run and discarded) — explicitly not a claim about whether the combination is
well-tuned, exactly like every other number in that table until item 3.

**Item 3.** There is no exit tile yet — that's items 4-5, still ahead. So
"reach pressure (how often the best-scoring move is away from the exit)" as
written can't be measured literally. Every board here is already a bounded
region though: a grid has hard edges (`inBounds`), a hex sprawl has
`hexRadius`. That boundary is exactly the shape a room border will have, so
it stands in as a proxy exit: `tools/probe.test.ts`'s `api()` façade gained
one method, `edgeDist(key)` (0 on the boundary, counting inward), and `play()`
now tracks, on every turn after turn 5 (same gate `minCells` already used —
consistency, and the opening placements are noise either way), whether a
boundary cell was legally reachable at all (`reachEligible`) and, if so,
whether the best-scoring move (`m[0]`, already sorted) went there or chased
the interior instead (`reachAway`). `reachPct = 100 * Σaway / Σeligible`
across all 20 greedy seeds — null, not 0%, when a boundary cell was never
reachable, matching how `skill` already handles "the ratio measures nothing"
rather than printing a fake floor. This measures precisely the
farm-one-rich-pocket-ignore-the-map pathology the room design exists to fix,
without needing a real exit to exist first. It should be revisited once item
5 lands a real exit condition rather than assumed to still be measuring the
same thing — the file header says so explicitly.

`multPct` and the whole `multActive` counter are gone — `.mult` hasn't
existed on `ScoredPlacement` since item 1, so the old code was reading
`undefined > 1` (always false) the entire time; item 1's own decisions log
already flagged this as "harmless dead code in a script item 3 replaces."

`winPct` is renamed `clearPct` everywhere (probe output, `RulesetMetrics`,
`MetricsPage`, `SetupPage`) — same computation, `score reached target`,
nothing added. The header comment and the field's own doc comment both say
plainly that this is *not* gated on reach and will need item 6 to actually
mean "cleared a room." Renaming now rather than later means the vocabulary
the room UI will use ("clear") is established before there's a UI to be
inconsistent with.

`spread` is untouched, per the item's "kept" — no code changed there beyond
moving it one column over in the printed table.

Recalibration piggybacks on the real probe rather than a throwaway script
this time, since `play()`'s greedy score has always been target-independent
(it runs with `targetScore: Infinity` internally and only compares against
the real target afterward) — so running `npm run probe` once with the *old*
targets already produces the correct new medians in its `greedy` column.
Ran it, copied every ruleset's measured greedy median into its
`targetScore` in `rulesets.ts` (and `CONFIG.targetScore` for poker-baseline,
which uses `CONFIG` directly rather than `base({...})`), then ran the probe
a second time so `metrics.generated.ts` reflects the final calibrated
targets — `clearPct` now reads ~50% almost everywhere, exactly what
"target = measured median" should produce, rather than the leftover
placeholder-target skew the table had before this item.

Two exceptions, both carried forward from existing, already-documented
decisions rather than new ones:
- `mech-lock-cash` keeps using its 2-ply median (192, was 175) — the
  ruleset's own long-standing comment says greedy is not a valid agent
  there, and this probe run confirms it again (greedy median 18, *below*
  careless's 30 — greedy has no gradient to follow when nothing banks until
  cashed, so it wanders).
- `poker-tight` needed a value distinct from `poker-baseline` — same
  `Config` in every field except `targetScore`, so its own greedy median is
  necessarily identical (881) and can't set a harder bar. Computed its p80
  over the same 20 seeds with a throwaway script (`sorted scores: [811..981],
  p80: 916`, run and discarded, not committed) — the same fix item 1 used
  for the same reason.

`poker-mult-amped` and the inert `axisMode` rulesets (`mech-both-axes`,
`mech-suit-axis`) measured identically to their baselines again, confirming
item 1's note that they're re-skins now. Their blurbs said "kept as a marker
until item 3 decides whether to retire it" — item 3 is a probe-rebuild item,
not a scoring-mechanics item, so per the standing rule ("if an item seems to
require changing how the current modes score, it is the wrong item")
deciding their fate is out of scope here too. Reworded the blurbs so they no
longer point at "item 3" as the resolution moment (that would now be stale)
and instead point at "whichever later item" — items 19 and 22 (archetypes,
calibration pass) are the more natural home for that call, not this one.

`combo-cribbage-poker`'s target (1571) needed no change — the freshly
measured greedy median came back exactly 1571, same as item 2's throwaway
placeholder. Reworded its blurb since "placeholder pending item 3" is no
longer true; it's now exactly as probe-calibrated as everything else.

`MetricsPage.tsx` swapped the `multPct` column for `reachPct` and added a
`clearPct` column (previously computed but not displayed at all — `winPct`
existed in the data since the file was first generated but nothing in the
UI read it). Added a `nullTitle` field to `Column` rather than hardcoding
skill's null-tooltip text, since `reachPct` can now also be null for a
different reason (no boundary cell ever reachable, not "random play scored
zero") and the old hardcoded string would have been actively wrong on that
row.

**Item 4.** `src/rooms/room.ts` defines `Room` as `{ name, cells: ReadonlySet<string> }`
— a frozen set of hex keys, nothing else. `isRoomBorder(room, h)` is "in the
room and at least one neighbour is not"; `roomBorder`/`roomInterior` partition
`roomCells(room)` by that predicate. No radius appears anywhere in the type or
its functions — the old `inHexBounds`/`hexesWithinRadius` gate in
`hex/board.ts` is untouched (existing sprawl mode still uses it) and nothing
in `rooms/` imports `Config` or touches the engine, `Structure`, or any
scorer, so there was nothing here that could regress the existing game.

`src/rooms/shapes.ts` hand-authors two rooms, per the item's "data, not
procedural" framing (that's item 20's job): `ROUND_ROOM` freezes
`hexesWithinRadius(2)` into a literal cell set — reusing the existing radius
helper to *build* the list is not the same as the `Room` type depending on a
radius, and typing 19 pairs by hand would have added nothing but risk of a
transcription error. `HOURGLASS_ROOM` is 17 literal `{q,r}` pairs: two
radius-1 discs (a centre plus its six neighbours, 7 cells each) joined by a
3-cell, one-hex-wide neck. This shape exists specifically to falsify "the
border is always the outermost ring" — the neck cells sit at the shape's
geometric middle along its long axis, yet every one of them touches the
outside, so they're border. Verified this in `room.test.ts` directly
(`isRoomBorder` true for all three neck cells, `roomInterior` returning
exactly the two chamber centres) rather than trusting the render to make the
point on its own.

Designed the hourglass's exact coordinates with a throwaway node script (not
committed) that builds two `hexesWithinRadius(1)` discs at `(0,-3)` and
`(0,3)` plus an explicit 3-cell neck, dedupes, and reports border/interior
counts — needed because a first attempt (two bare 7-cell rows with a 1-cell
neck, no radius-1 discs) came back with *zero* interior cells, i.e. every
cell was border and the shape didn't actually demonstrate anything a disc
couldn't. Widening the chambers to full radius-1 discs is what gives each
one a genuine interior cell (its centre) to contrast against the neck.

`RoomBoardView.tsx` reuses `hexToPixel` (unmodified, from `hex/coords.ts`)
for layout — the same pixel math `HexBoardView` uses — but iterates
`roomCells(room)` instead of `hexesWithinRadius(cfg.hexRadius)`, which is
the whole of "rendering follows the shape": no card layer, no interactivity,
no engine, just cells tinted by `isRoomBorder`. Kept as a new file rather
than a parameter added to `HexBoardView` — that component already carries
drag/preview/cascade wiring that a shape-only view has no use for, and the
standing rule is to leave the existing game's rendering untouched.

There is no room-mode run yet — no engine wiring, no exits (item 5), no
threshold (item 6) — so there was nothing to reach a room through from
inside a normal game session. Added a plain dev-preview page instead
(`RoomsPreviewPage.tsx`, reachable via a new "Rooms" header button next to
Metrics/Setup) purely so the shape and its border are actually visible and
screenshot-able in the running app this firing, rather than only provable
in a test file. Labelled it "(dev preview)" and its subtitle spells out what
is not wired up yet, so it reads as scaffolding rather than the mode. Expect
this page to be replaced outright once item 7 lands a real room-to-room run
— it is not meant to be the permanent home for room shapes.

**Item 5.** The main judgment call: what does "touch" mean? An exit is an
ordinary room cell (still placeable — there is no tile layer restricting
placement yet, that's item 8), so "touch" is occupancy: placing a card on
an exit hex is what reaching it means, the same way any other hex is
claimed by being played on. `makeRoom(name, coords, exits = [])` gained a
third, optional parameter and validates at construction time (throws) that
every exit is both one of the room's own cells and a border cell — an
"exit" that isn't reachable from outside the room isn't a coherent doorway,
and failing loud at room-definition time is cheaper than a silent bad
config later. `isExit`/`roomExits` mirror the existing `isRoomBorder`/
`roomBorder` shape.

`structureReachesExit(room, structure: ReadonlySet<string>)` takes the
structure as a bare set of hex keys — the same shape `HexBoard`'s keys
already use — rather than a `HexBoard`/`Card` map, keeping it decoupled
from the engine exactly like `Room` itself (no room has an engine wired to
it until item 7). It does real connectivity work rather than a bare
`exits.has(k)` membership test: it computes connected components of the
structure under hex adjacency and asks whether any component contains an
exit. Documented why this matters even though every test today could be
satisfied by plain membership — a structure need not be one contiguous
blob (free-placement rulesets already exist, and item 17 talks about a
second origin), and a stray disconnected placement elsewhere on the board
must not falsely credit reach through an unrelated piece. Tested this
directly: two single-cell blobs, one on the exit and one far from it,
still reach (the exit's own component is enough); the same far blob with
the exit removed from the structure does not. A full BFS is one component
class of bug cheaper to get wrong than it looks, so it's covered by its
own describe block rather than folded into the exit-membership tests.

Both hand-authored rooms got two opposite exits rather than one, so
"reach an exit" is a real directional choice: `ROUND_ROOM` at due east/west
on its ring (`{q:2,r:0}`/`{q:-2,r:0}`), `HOURGLASS_ROOM` at the two chamber
tips (`{q:0,r:-4}`/`{q:0,r:4}`) rather than anywhere in the neck — the neck
already carries enough narrative weight as the pinch point without also
being a doorway.

Extended `RoomBoardView` with two new optional props, `structure` and
`onCellClick`, rather than a new component — the shape-only callers (none
yet outside the dev preview, but item 4's contract) keep working unchanged
since both are optional. Exit cells render a third tint (green, labelled
"EXIT") layered over the border/interior distinction; occupied cells get a
yellow inset ring plus a dot glyph, chosen over changing the fill colour so
occupied-and-exit and occupied-and-border remain visually distinguishable
at once. `RoomsPreviewPage` added a click-to-toggle stand-in structure per
room (there is still no card or engine wiring, so a plain hex click is the
only available substitute) and a live "Reached"/"Not reached" label driven
straight off `structureReachesExit`, satisfying "show reached/not reached"
without waiting on item 7's real run. Reworded the preview's subtitle now
that exits exist — "no threshold or run integration yet" is what's still
missing, not "no exits."

**Item 6.** `Room` gained a fourth field, `threshold: number`, set through
`makeRoom`'s new optional fourth parameter (default `0`, so every existing
call site and test — including all of item 4/5's suite — kept compiling
and passing with no `threshold` argument). The clearing logic itself is one
new function, `roomEndState(room, structure, score): RoomEndState`,
returning `{ reached, score, threshold, scoreMet, cleared }` rather than a
single boolean — the item's own text asks for "both conditions
separately", and a caller that only wants pass/fail can still read
`.cleared` off it. `cleared` is exactly `reached && scoreMet`, per the
pre-declared decision table's "both, always"; no partial-credit path
exists or was added.

The harder call was what threshold value to give the two hand-authored
rooms. The standing rule is "never tune a room by eye," but item 22 is
explicitly where thresholds get set from probed medians, and no room has
an engine wired to it yet to probe (that's item 7) — a room-shaped score
doesn't exist to measure. Rather than block on that or quietly pick a
number and call it calibrated, gave both rooms the same round placeholder
(`50`) and said so in both `shapes.ts`'s comment and `room.ts`'s doc
comment, the same way item 1/2's `targetScore` placeholders were labelled
placeholders rather than presented as tuned. `roomEndState` reads
`threshold` straight off whatever `Room` it's given, so recalibrating in
item 22 is a one-line change per room, not a signature change anywhere
that calls it.

The preview page needed a stand-in for "score" the same way item 5 needed
a stand-in for "structure" — clicking cells for placement, a plain number
input for score, since there is still no card/engine wiring into a room
(item 7). Chose a single mutable number per room rather than trying to
derive one from the clicked cells: there is no scorer that turns "these
hexes are occupied" into a point value without cards on them, and building
one here would be reaching into item 7's job. The panel now prints three
lines instead of one: reach (unchanged from item 5), a score line showing
`score / threshold` and `(met)`/`(short)`, and a cleared line whose text
depends on *which* condition is missing — "you got there but were short"
when reached-but-not-scoreMet (the exact near-miss wording the item asks
for), a symmetrical "score is enough, but you have not reached an exit"
for the other near-miss, and a plain "Not cleared" only when neither
holds. `data-room-cleared` and `data-room-score-met` attributes were added
alongside the existing `data-room-reach` so the smoke test can assert on
each condition independently rather than screen-scraping the prose.

## Results log

**Item 1.** `npm test` 203/203 (was 208 — 5 tests removed, all for formulas
that no longer exist: cribbage's mult formula, hex's "mult never below 1",
and two of five `axisMode` differentiation tests collapsed into one
"scores identically across modes" test since that's now the actual
behaviour). `npx tsc -b --noEmit` clean. `npm run smoke` 18/18, extended
with the new label text. Screenshots taken driving grid and hex placement,
the score log, and the scoring-rules panel via `tools/browser.mjs` — all
show plain `N + M = score` in place of `chips × mult = score`, no leftover
"chips"/"mult" language in the header, legend, or rules panel. No video —
this item changed the score model, not movement or feel.

New `targetScore` values (greedy-agent median over 20 seeds, additive
model; old values shown for scale, not comparability — the score model
changed underneath them):

| ruleset | old target | new target |
|---|---|---|
| poker-baseline | 300 | 870 |
| poker-tight | 540 | 935 (p80, see decisions log) |
| poker-mult-amped | 620 | 870 |
| poker-partials | 300 | 895 |
| poker-short-run | 370 | 550 |
| poker-partials-generous | 700 | 925 |
| poker-flat-ranks | 435 | 635 |
| poker-short-lines | 520 | 870 |
| poker-long-lines | 660 | 920 |
| poker-lean-hand | 545 | 805 |
| poker-small-board | 440 | 670 |
| draft-cribbage | 345 | 535 |
| draft-poker | 440 | 725 |
| draft-hex | 625 | 860 |
| hex-sprawl | 1200 | 1445 |
| hex-sprawl-blank | 1120 | 1235 |
| hex-sprawl-flat | 965 | 1125 |
| cribbage-blank | 550 | 770 |
| poker-blank | 570 | 820 |
| cribbage | 600 | 820 |
| cribbage-unbound | 1050 | 1315 |
| cribbage-pure | 450 | 580 |
| cribbage-lean | 500 | 685 |
| reference-poker-squares | 405 | 615 |
| mech-both-axes | 3750 | 820 |
| mech-suit-axis | 665 | 820 |
| mech-deferred | 150 | 190 |
| mech-free | 610 | 820 |
| mech-lock-cash | 265 | 175 (2-ply median) |
| cribbage-flush3 | 660 | 845 |

These are placeholders, not calibration — item 3 rebuilds the probe
(reach pressure, spread, clear rate) and recalibrates for real. None of
this speaks to the room-shape questions the mode is actually being built
to answer.

**Item 2.** `npm test` 215/215 (203 from item 1 + 12 new: 8 in the new
`lens.test.ts` for `combineLenses` / `activeLensIds` / `getScoringLens`, 1 in
`board.test.ts` proving `scorePlacement` under a second counter scores
strictly more than the primary counter alone, 2 in `setup.test.ts`'s
`normalise` for the identical-second-counter dedup, 1 in `setup.test.ts`'s
`visibleFields` for a lens's fields showing up when it's the *second* counter
rather than the primary). `npx tsc -b --noEmit` clean. `npm run smoke` 19/19
— extended with a run through the
combo preset: select "Cribbage + Poker" from the Setup screen's preset
dropdown, start it, and check the header names both counters, so the smoke
suite now has an end-to-end path proving the combination reaches a real run
and not just the setup form.

Drove the combo ruleset in headless Chromium via `tools/browser.mjs`:
screenshots of the Setup screen with the preset selected, the live board, a
hover preview mid-placement, the score log after placing, and the Scoring
panel. The preview screenshot shows the row line itemised as "Cribbage: Cards
(2)" (6) + "Poker: High Card" (5) + "Poker: Ranks (2)" (8) = 19, and the
placed-card log confirms the bank matches (19 row + 9 col = 28) — the
line-level proof that a line scoring under both counters gets both, not
whichever is larger. The Scoring panel shows both lenses' rule sections back
to back, each still legible as its own ruleset. No video — this item changed
what a line is worth, not movement or feel.

Median greedy score for `combo-cribbage-poker` over 20 seeds: 1571 (used as
its placeholder `targetScore`, same throwaway-script method as item 1's
table — not a probe measurement).

**Item 3.** `npm test` 215/215, unchanged — this item touched the probe
(explicitly excluded from `npm test`) and the ruleset/metrics data, not the
scorers. `npx tsc -b --noEmit` clean. `npm run smoke` 22/22 — added 3 checks
that the Metrics page shows "Reach pressure" and "Clear rate" and no longer
shows "mult live" anywhere, guarding the rename against a silent partial
revert.

Full recalibrated probe output (20 seeds each; `reach%` and `clear%` are the
new columns, `mult%`/`win%` are gone):

| ruleset | target | greedy | careless | skill | 2ply | lift | reach% | spread | minCells | clear% |
|---|---|---|---|---|---|---|---|---|---|---|
| poker-baseline | 881 | 881 | 600 | 1.47 | 910 | 1.03 | 71% | 1.7 | 10 | 55% |
| poker-tight | 916 | 881 | 600 | 1.47 | 910 | 1.03 | 71% | 1.7 | 10 | 20% |
| poker-mult-amped | 881 | 881 | 600 | 1.47 | 910 | 1.03 | 71% | 1.7 | 10 | 55% |
| poker-partials | 915 | 915 | 612 | 1.50 | 989 | 1.08 | 66% | 1.8 | 10 | 50% |
| poker-short-run | 545 | 545 | 366 | 1.49 | 557 | 1.02 | 81% | 1.7 | 10 | 50% |
| poker-partials-generous | 946 | 946 | 614 | 1.54 | 1021 | 1.08 | 65% | 1.8 | 9 | 50% |
| poker-flat-ranks | 615 | 615 | 440 | 1.40 | 650 | 1.06 | 75% | 1.7 | 10 | 50% |
| poker-short-lines | 890 | 890 | 577 | 1.54 | 911 | 1.02 | 46% | 1.6 | 2 | 50% |
| poker-long-lines | 920 | 920 | 611 | 1.51 | 945 | 1.03 | 80% | 1.9 | 12 | 50% |
| poker-lean-hand | 830 | 830 | 619 | 1.34 | 855 | 1.03 | 72% | 1.7 | 10 | 50% |
| poker-small-board | 676 | 676 | 463 | 1.46 | 709 | 1.05 | 39% | 1.7 | 8 | 50% |
| draft-cribbage | 534 | 534 | 372 | 1.44 | 570 | 1.07 | 62% | 2.7 | 9 | 50% |
| draft-poker | 714 | 714 | 593 | 1.20 | 744 | 1.04 | 66% | 1.5 | 9 | 50% |
| draft-hex | 858 | 858 | 478 | 1.79 | 912 | 1.06 | 59% | 2.6 | 13 | 50% |
| hex-sprawl | 1342 | 1342 | 480 | 2.80 | 1505 | 1.12 | 55% | 4.3 | 13 | 50% |
| hex-sprawl-blank | 1146 | 1146 | 468 | 2.45 | 1256 | 1.10 | 81% | 3.0 | 6 | 50% |
| hex-sprawl-flat | 1089 | 1089 | 390 | 2.79 | 1164 | 1.07 | 62% | 4.4 | 13 | 50% |
| cribbage-blank | 687 | 687 | 309 | 2.22 | 723 | 1.05 | 86% | 3.5 | 5 | 50% |
| poker-blank | 841 | 841 | 556 | 1.51 | 862 | 1.02 | 75% | 1.7 | 5 | 50% |
| cribbage | 747 | 747 | 315 | 2.37 | 816 | 1.09 | 58% | 4.3 | 9 | 50% |
| cribbage-unbound | 1170 | 1170 | 327 | 3.58 | 1251 | 1.07 | 36% | 6.0 | 13 | 55% |
| cribbage-pure | 528 | 528 | 120 | 4.40 | 612 | 1.16 | 49% | 36.0 | 10 | 55% |
| cribbage-lean | 690 | 690 | 312 | 2.21 | 726 | 1.05 | 61% | 4.0 | 10 | 50% |
| reference-poker-squares | 647 | 647 | 571 | 1.13 | 702 | 1.09 | 45% | 0.0 | 1 | 50% |
| mech-both-axes | 747 | 747 | 315 | 2.37 | 816 | 1.09 | 58% | 4.3 | 9 | 50% |
| mech-suit-axis | 747 | 747 | 315 | 2.37 | 816 | 1.09 | 58% | 4.3 | 9 | 50% |
| mech-deferred | 201 | 201 | 69 | 2.91 | 321 | 1.60 | 50% | 0.0 | 8 | 50% |
| mech-free | 747 | 747 | 141 | 5.30 | 816 | 1.09 | 58% | 8.0 | 31 | 50% |
| mech-lock-cash | 192 | 18 | 30 | 0.60 | 192 | 10.67 | -- | 9.0 | 0 | 0% |
| combo-cribbage-poker | 1571 | 1571 | 907 | 1.73 | 1619 | 1.03 | 65% | 2.2 | 9 | 50% |
| cribbage-flush3 | 759 | 759 | 330 | 2.30 | 837 | 1.10 | 58% | 4.3 | 9 | 50% |

`clearPct` landing on ~50% almost everywhere is by construction (target =
measured median), not a finding — it's the signal the recalibration worked,
same as it was after item 1's throwaway pass. `mech-lock-cash` stays at 0%
because its target comes from the 2-ply median, not greedy, per its
existing documented exception.

`reachPct` is the first real finding of this item, and it already shows the
texture the room design predicts: `cribbage-unbound` (long lines, high
skill gap ×3.58) sits lowest at 36% — building a long line keeps pulling the
best move back toward where the line already is, away from the edge.
`cribbage-blank` sits highest at 86% and `hex-sprawl-blank` at 81% — both
start with no anchor, so the very first placements *are* near an edge by
definition and greedy has nowhere richer to go yet. `hex-sprawl` itself (the
ruleset item 1's motivation section singles out for its 15.5 choice spread)
sits at 55% — the interior-farming pull is real but not overwhelming on its
own, which is exactly the gap the room's reach-and-score dual condition is
meant to close once it exists. None of this is a room measurement — it's a
baseline on the *current* open boards, useful chiefly as the "before"
number item 22's calibration pass can compare a real room's reach pressure
against.

Screenshots taken driving the Metrics page (sorted by reach pressure,
showing the new column and the "Clear rate" column with its own bar) and the
Setup page (showing "clear rate ×50%" in the calibration blurb) via a
throwaway Playwright script (same pattern as `tools/smoke.mjs`'s server
setup, run and discarded, not committed) in headless Chromium. No video —
this item changed measurement, not movement or feel.

**Item 4.** `npm test` 228/228 (was 215 — 13 new in `room.test.ts`, nothing
existing touched). `npx tsc -b --noEmit` clean. `npm run smoke` 26/26 —
extended with 4 checks: the new "Rooms" header button opens the dev preview,
both hand-authored shapes render at least one cell each, and — the one that
actually guards the point of this item — the hourglass's neck cell `0,0`
reports `data-room-border="true"` rather than being read as interior.

Room shape counts (`room.cells.size` / `roomBorder` / `roomInterior`, all
asserted in tests and matching what the preview page prints):

| room | cells | border | interior |
|---|---|---|---|
| Round Room (radius-2 disc) | 19 | 12 | 7 |
| Hourglass | 17 | 15 | 2 |

Drove `RoomsPreviewPage` in headless Chromium via `tools/browser.mjs`
(throwaway script, same server-then-screenshot pattern as `smoke.mjs`, run
and discarded, not committed): screenshot shows the round room as a single
pink outer ring around a blue 7-cell interior, and the hourglass as two
small chambers (one interior cell each) joined by a pink neck with no blue
cells in it at all — border cells running straight through the shape's
middle, the thing a radius-based room could never draw. No video — this
item is static geometry, not movement or feel.

**Item 5.** `npm test` 246/246 (was 228 — 18 new in `room.test.ts`: exit
validation at `makeRoom`, `isExit`/`roomExits`, and `structureReachesExit`
including the connected-vs-disconnected-component cases). `npx tsc -b
--noEmit` clean. `npm run smoke` 30/30 — added 6 checks: the round room's
east exit reports `data-room-exit="true"`, the panel starts "Not reached",
clicking a non-exit border cell leaves it "Not reached", clicking the exit
cell flips it to "Reached", and unclicking it flips back.

Exit placement (both rooms, opposite doorways, verified in tests):

| room | exits |
|---|---|
| Round Room | `2,0` (east), `-2,0` (west) |
| Hourglass | `0,-4` (top tip), `0,4` (bottom tip) |

Drove `RoomsPreviewPage` in headless Chromium via `tools/browser.mjs`
(throwaway script, same server-then-screenshot pattern as `smoke.mjs`, run
and discarded, not committed), clicking cells to build stand-in structures:
a structure occupying the origin plus a non-exit border cell on the round
room stayed "Not reached"; adding the east exit cell flipped it to
"Reached", rendered with a green "EXIT" tile and a yellow occupied ring.
On the hourglass, a full connected chain of 9 cells from the top tip
through the neck to the bottom tip reached both exits, showing "Reached"
with every link in the chain visibly marked occupied — the clearest
demonstration that this is genuine path connectivity and not a per-cell
membership check. No video — this item is still geometry and a state
flip, not movement or feel.

**Item 6.** `npm test` 253/253 (was 246 — 7 new in `room.test.ts`: two for
`makeRoom`'s threshold default/override, five for `roomEndState` covering
cleared, the reached-but-short near-miss, the scored-but-not-reached
near-miss, neither, and the score-exactly-at-threshold boundary). `npx tsc
-b --noEmit` clean. `npm run smoke` 34/34 — added 4 checks: reached-but-
under-threshold does not clear and its score line reads "short, not
met"; filling the stand-in score to the threshold while still on the exit
clears the room; unclicking the exit afterward loses reach *and* loses
clear even though the score is still met, proving `cleared` tracks both
conditions live rather than latching once true.

Both hand-authored rooms' thresholds (both `50`, chosen as a round
placeholder — see decisions log for why a real one isn't possible before
item 7/22):

| room | threshold |
|---|---|
| Round Room | 50 |
| Hourglass | 50 |

Drove `RoomsPreviewPage` in headless Chromium via `tools/browser.mjs`
(throwaway script, same server-then-screenshot pattern as `smoke.mjs`, run
and discarded, not committed): one screenshot with the round room's
structure on the east exit and the stand-in score at 20 shows "Reached" /
"Score 20 / 50 (short)" / "You got there but were short" in amber-and-grey
next to the still-untouched hourglass reading "Not reached" / "Not
cleared"; a second screenshot with the same structure and the score raised
to 60 shows all three lines flip to emerald and "Cleared". The two
screenshots side by side are the whole point of this item — a near-miss
and a genuine clear are visually and textually distinct, not two shades of
"you lost". No video — this item is a state readout, not movement or
feel.
