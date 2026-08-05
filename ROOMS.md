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

> **These are pre-additive numbers.** The ×5.36, the 15.5 and the lift range
> below were all measured against chips × mult, which item 1 retired. They are
> kept because they are why this design exists, not because they are still
> live. The current figures are in item 3's recalibration table in the results
> log — hex sprawl now measures a spread of **4.3** and a lookahead lift of
> **1.12**. Anything comparing a room against a baseline must use those.

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
- [x] **7. Two rooms joined.** Leave through an exit, arrive in the next room
      with your deck intact and a fresh placement budget. Running total carries;
      per-room score resets. This is the first moment the mode is the thing the
      brief describes.

### C. Tiles

- [x] **8. The tile layer.** `TileMap` parallel to `HexBoard`, a `Tile` union,
      rendering underneath cards so a placed card does not hide what it landed
      on. No effects yet — this item is the substrate and its tests.
- [x] **9. Bonus tiles: card multipliers.** Double or triple the placed card's
      own contribution to every line through it. The Scrabble letter square.
- [x] **10. Bonus tiles: line multipliers.** Double the total of one line
      through the tile. The Scrabble word square, and a different decision —
      letter squares reward a big card, word squares reward a big line.
- [x] **11. Blocked tiles.** Rubble that cannot be placed on, so a room's shape
      can constrain routes rather than just bound them. Cheap, and it makes
      reach a real problem.
- [x] **12. Traps.** Placing on or beside one costs you a card from hand or
      deck. Revealed on trigger; hidden before. Test the deck accounting
      carefully — silently losing the wrong card is the worst class of bug here.
- [x] **13. Artifact cards.** A card sitting on the board that joins your deck
      when your structure connects to it. The reason to detour.

### C½. Teaching the probe to play a room

Inserted after item 11 shipped, ahead of section D. Items 4-11 built the room;
the probe still plays the pre-room game. `tools/probe.test.ts` says so in its
own header — reach pressure uses the board edge as a stand-in exit and "once
item 5 lands a real exit condition this should be revisited rather than assumed
still correct". Item 5 landed and it was not revisited. Every room built since
has been measured by nothing.

**Item 22 is blocked until all three of these land**, and the order matters:
13b is a prerequisite, 13c is the one that decides whether the design works,
13d is a refinement. A deeper score-maximiser has exactly the same blindness as
a shallow one — it still never walks to the door.

- [x] **13b. Teach the probe to play a room.** A room façade behind the same
      agent API the grid and hex paths already use: an agent still sees `Move[]`
      and returns one, but the moves are room-cell placements and a run is one
      room over its placement budget. `clear%` becomes the real condition —
      reached an exit **and** score ≥ threshold — reported as two columns so a
      near-miss reads as "got there but short" the way item 6's end state does.
      Leave the existing grid/hex rows byte-identical: this adds rows, it does
      not change them. The existing edge-based `reach%` keeps its name and
      meaning for those rows; the room rows get a separate honest column rather
      than quietly reusing it for a different question.
- [x] **13c. An agent that wants to leave.** Every agent today picks by score
      alone (`greedy` takes `m[0]`, `lookahead` maximises `v + follow`), so a
      room is cleared only by accident and `clear%` measures the bot's blindness
      rather than the design. Add a goal-seeking agent that values score *and*
      progress toward an exit — simplest form, `v + w ×` (reduction in distance
      from the structure to the nearest exit) — sweep `w` over a few values and
      record the one chosen and why. Then report clear rate for greedy and for
      goal-seeking side by side. **The gap between those two is itself the
      finding**: it is how much a room punishes pure score-chasing, which is the
      thing the whole reach-and-score dual condition was built to create. A gap
      near zero means the exit condition is not biting.
- [x] **13d. Deeper search.** Beam search at depth 3-4 (keep the top-N beam;
      full width will not fit). Report it as a **new** column beside the
      existing 2-ply lift rather than replacing it, so the historical column
      keeps its meaning and the two are comparable. Expect roughly 25× the
      lookahead agent's cost — if `npm run probe` runs past its timeout, cut the
      seed count **for the deep agent only** and say in the results log that it
      is a smaller sample. Never silently truncate: a quietly shortened sample
      is how a measurement bug ships looking like a result.

### D. What you carry

- [x] **14. Inventory and the effect hook.** An items list on the Expedition and
      one place where item effects apply. No items yet — substrate and tests.
- [x] **15. Item: a second counter.** Grants a counting method for the rest of
      the run, using item 2's machinery. The clearest expression of "carried
      items may let you switch or combine scoring methods".
- [x] **16. Item: sight.** See the next room's shape, or reveal this room's
      hidden tiles. Changes decisions without touching score, which is the point
      of keeping items away from multipliers.
- [x] **17. Item: reach.** Something that helps the spatial condition — place
      one card unconnected, or extend from a second origin. Reach and score are
      the two exit conditions; items should be able to address either.
- [x] **18. Temporary versus permanent.** Some bonuses last a room, some last
      the expedition. Make the distinction visible in the UI before there are
      enough effects for it to get confusing.

### E. Variety and calibration

- [x] **19. Room archetypes.** Rooms that differ in active counters, tile
      density and threshold. This is where "Hearts world" style variety lives —
      as a room property, not a separate build.
- [ ] **20. Seeded room generation.** Shapes, tiles and exits from a seed, with
      the hand-authored rooms kept as fixtures so failures stay reproducible.
- [ ] **21. Room graph and route choice.** More than one exit, leading to
      different next rooms, with something known about each before you commit.
- [ ] **22. Calibration pass.** Requires 13b, 13c and 13d — until the probe can
      play a room there is nothing here to calibrate against. Probe every
      archetype, set thresholds from measured medians, and record the numbers.
      Then answer the two questions this design was built to answer, each with
      an explicit pass or fail rather than a paragraph:

      - **Choice spread**, against `hex-sprawl`'s **4.3**. Pass = lower.
      - **Lookahead lift**, against `hex-sprawl`'s **1.12** on 2-ply and
        whatever 13d's deep column reports for it. Pass = higher on both.

      Both baselines are the *post-additive* figures from item 3's recalibration
      table in the results log. The 15.5 spread and the 1.26–1.43 lift quoted at
      the top of this file are pre-additive and are void — they measured a score
      model that no longer exists, and comparing a room against them would
      manufacture a pass out of the units changing.
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
  **Favicon**: 🚪 — not recorded before item 18's firing (no prior entry here
  and none discoverable in the fetched page itself), chosen fresh and written
  down here so it stays stable across every later republish.
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

**Item 7.** Built as its own module, `src/rooms/expedition.ts`, rather than
wiring a room into `createEngine` (`engine.ts`). That engine's `settle`
decides "won" from `state.score >= cfg.targetScore` — a single-run target,
and ROOMS.md's own "what transfers" section already voids every
`targetScore` the moment scoring changes shape. A room's win condition is
`roomEndState` (reach *and* score, both, always), a different quantity
entirely, so grafting rooms onto the engine's settle logic would mean
fighting it rather than reusing it. What *did* reuse cleanly: `scoreHexPlacement`,
`withHexCard`, `hasHexNeighbor`, `isHexBoardEmpty` all operate on a bare
`HexBoard` map and never cared whether the legal cells around them came from
a radius or a room shape. The only new logic is legality —
`isLegalRoomPlacement` checks `isInRoom` instead of `inHexBounds` — plus the
run orchestration on top: `newExpedition`, `placeInRoom`, `leaveRoom`.

`ExpeditionState` carries `rooms` (the fixed sequence — item 21's room graph
replaces this later), `roomIndex`, `board`, `deck`, `hand`, this room's
`score`, the cross-room `runningTotal`, `placementsLeft`, a global `log`
(every entry tagged with `roomName` — nothing said the log should reset with
the score, and a full expedition history is strictly more useful than a
per-room one), and `status` (`'playing' | 'lost' | 'complete'`).
`leaveRoom` is a no-op unless `currentEndState(state).cleared` is true right
now — reach and score are read live off the actual board rather than latched,
mirroring item 6's `roomEndState` itself, even though with real cards
(never removed once placed) reach in practice can only go false→true, never
back. Leaving costs nothing on its own: the placements spent clearing the
room were the cost, matching the item's framing of "arrive... with a fresh
placement budget" as the whole point, not something a leave fee should eat
into. Deck and hand are literally the same array references after a leave
(no draw happens), which is what "deck intact" means taken literally rather
than "reshuffled but same size" — proven with `toBe`, not `toEqual`, in
`expedition.test.ts`.

The failure rule ("running out of placements without clearing = run over")
needed one piece of judgment: what if the *last* placement in the budget is
the one that clears the room? Reading "no partial credit for a room" as
being about score, not about timing, `settleExpedition` checks
`currentEndState(state).cleared` before declaring the room stuck-and-lost —
a room cleared on placement zero of its remaining budget still reads
`'playing'`, with `leaveRoom` the very next legal action. Getting this wrong
either way is a real bug class (a player who clears a room only to have it
retroactively call that a loss, or the opposite — never actually failing a
room because "stuck" is checked before "cleared" — so both directions are
covered in `expedition.test.ts`.

No anchor-card logic — `cfg.startWithAnchor` is not read here. A room's
first cell is a real choice among the room's own cells (any of them: the
adjacency requirement only applies once the board is non-empty, same as the
existing hex sprawl), not a fixed origin the old radius-based board always
contained; some rooms plausibly won't even contain `{q:0,r:0}` once shapes
get more varied (item 19+), so hard-coding an origin-anchor here would be
wrong in general, not just unimplemented.

Added one field to `Config`: `roomPlacementBudget` (12), sitting next to the
hex fields since Rooms is additive and every other tunable already lives in
`config.ts`. Labelled a placeholder in its own doc comment, the same as the
hand-authored rooms' `threshold` — Rooms has no probe yet (item 3's rebuild
measured the old open boards, item 22 is where rooms get calibrated), so per
the standing "never tune by eye" rule this number is a round guess, not a
measurement, until then.

**UI.** Replaced `RoomsPreviewPage.tsx` outright with `RoomRunPage.tsx` — the
old file's own comment said as much ("expect this page to be replaced
outright once item 7 lands a real room-to-room run... not meant to be the
permanent home for room shapes"). The new page is deliberately not routed
through `useRun`/`useCardDrag`: those exist to drive `createEngine`'s
target-score run, and `expedition.ts`'s header explains why rooms can't
reuse that settle logic. A click-to-select-then-click-to-place flow (no
drag) keeps this item's scope to the run logic it exists to prove rather
than a second drag implementation — worth revisiting once rooms has feature
parity pressure to look and feel identical to the sprawl.

`RoomBoardView` gained a `board?: ReadonlyMap<string, Card>` prop, additive
next to the existing `structure` (bare key set, still used by nothing now
that the dev preview is gone, but kept since it costs nothing and item 4's
contract was "shape-only callers keep working unchanged"). When `board` is
given, an occupied cell renders the real card instead of a plain dot.
Sized the card with the same inline `width`/`height`/`fontSize` formula
`HexBoardView` already uses for cards on hex cells (`1.05 * size`,
`1.35 * size`, `0.42 * size`) rather than `CardFace`'s default `md` geometry
— that geometry reads off a global `--cell` CSS variable pinned to the grid
board's width, which has no relationship to a room's own `size` prop and
first produced a card that visually overflowed its hexagon. Verified in the
browser this time rather than by eye alone: measured the actual DOM
`boundingBox()` of a placed card against its tile (46×59 inside a 76×88
tile, a 60%/67% fit — identical ratio to `HexBoardView`'s own cards) after
noticing a first screenshot still looked oversized and tracking it down to a
stale preview-server port left over from an earlier screenshot run, not a
real bug.

**Item 8.** `src/rooms/tile.ts` is new: `Tile` is a union of exactly one
member, `{ kind: 'marker'; label: string }`. Items 9-13 each add a real kind
(card-multiplier bonus, line-multiplier bonus, blocked, trap, artifact) with
whatever fields that kind actually needs — guessing those field shapes now
would be doing those items' design work early, for a shape likely to be
wrong anyway. `'marker'` exists solely to prove the substrate works: stored,
retrieved, and rendered under a placed card without disappearing. Nothing
anywhere reads a tile to change legality or scoring — that is what "no
effects yet" means, and `isLegalRoomPlacement`/`scoreHexPlacement` are both
untouched by this item.

`TileMap` is `ReadonlyMap<string, Tile>`, the same sparse-map-keyed-by-hex
pattern `HexBoard` already uses, with the same pure-update shape
(`withTile` mirrors `withHexCard`). Per the architecture section, tiles
"are a second map with the same keys rather than a change to the board
type" — true here in the literal sense that `hex/board.ts` was not touched
at all by this item.

The harder call was *where* `TileMap` lives: `Room` or `ExpeditionState`.
`HexBoard` lives on `ExpeditionState` because it is genuinely dynamic — it
starts empty every room and fills as cards are placed. A room's tile
*layout*, by contrast, is part of its hand-authored shape, the same way its
`exits` are: nothing places or removes a tile during play, at least not
before item 12 (trap reveal) exists. So `Room` grew a fourth field, `tiles:
TileMap`, set through `makeRoom`'s new optional fifth parameter
(`tileEntries: readonly (readonly [Hex, Tile])[] = []`, defaulting to
`emptyTileMap()` so every existing call site and test kept compiling with
no changes). `expedition.ts` needed zero changes as a result — a room's
tiles are just read off `currentRoom(state).tiles` wherever needed, the
same way its `threshold` already is. If a later item needs *per-instance*
tile state (a trap's hidden/revealed flag differing expedition to
expedition), that is a new, separate concern for that item to add — most
naturally as its own field on `ExpeditionState` keyed by cell, not by
redesigning this substrate, since "which cells have traps" (static, on
`Room`) and "which traps have been sprung this run" (dynamic, per
expedition) are different facts.

`makeRoom` validates tile placement the same way it already validates exit
placement: throws if a tile's coordinate is not one of the room's own
cells. Did not add the equivalent of `isRoomBorder` checking for tiles —
unlike an exit, there is no reason a tile must sit on the border, and nothing
in the item's text suggests one.

One `'marker'` tile was placed in `ROUND_ROOM` at `(1,0)`, labelled `'T8'`,
purely so the substrate is visible and screenshot-able in the actual running
app rather than only provable in a test file — the same reasoning item 4
used for its dev-preview page, except this time the real room shape carries
it directly since `RoomRunPage` already exists. Documented in `shapes.ts` as
a placeholder to be replaced by a real tile once items 9-13 land. `(1,0)` was
chosen deliberately: it is the second cell in the smoke test's existing
placement sequence (`(2,0)` → `(1,0)` → `(0,0)`), so extending that sequence
to check the tile survives a card landing on it needed no new sequence to
work out.

The one real design problem, not just a placeholder number: where on the hex
to put the badge. A first attempt pinned it to the top-left corner
(`left: 4px, top: 6px`) and it rendered as *nothing* — invisible, not just
faint. Root cause, found by screenshotting the empty tile in isolation and
seeing a blank hex: the cell's `clipPath` (`POINTY_TOP`, a hexagon whose top
and bottom vertices are single points) clips its full subtree, and a
pointy-top hex has almost zero width near its corners — a badge offset to
the side at a shallow y-coordinate sits entirely outside the clipped path
and never paints. The centred `CardFace` gets away with looking
unclipped only because it is narrow enough (60% of the hex's *widest* point)
to just barely still fit within the hex's tapered width even near where the
card's own corners land — a coincidence of the existing card-sizing formula,
not something a fixed-offset corner badge shares. Fix: centre the badge
horizontally (`left: 50%, transform: translateX(-50%)`) and place it in the
hex's untouched top sliver, above where the card's bounding box begins
(`top: 0.22 * size`, comfortably above the card's own top edge at
`(2*size - 1.35*size)/2 ≈ 0.325 * size` from the top) — measured against the
actual `CardFace` sizing formula `RoomBoardView` already uses for cards, not
guessed. Verified with a screenshot crop of just that cell, both before and
after a card lands on it (see results log).

Added `data-room-tile={tile?.kind}` to each cell div, mirroring
`data-room-border`/`data-room-exit`/`data-room-occupied`, so the smoke test
can assert on tile presence without screen-scraping the badge text.

**Not done this item, on purpose.** No tile blocks placement (item 11's
job), no tile changes a score (items 9-10's), no tile hides itself
(item 12's "hidden before" reveal semantics). `HOURGLASS_ROOM` got no tile —
one room proving the substrate is enough; adding a second would be testing
the same code path twice for no new information.

**Item 9.** The first real question was what "the placed card's own
contribution to a line" even means. Cribbage's count (fifteens, pairs, runs,
flush) is combinatorial across the whole line, not a sum of independent
per-card values — there is no field on a card that says "this is my share"
the way a Scrabble letter's point value is self-evident, and item 1's own
decisions log already noted cribbage's formula doesn't decompose per card.
The generic definition that works for any `Lens` (cribbage, poker, or a
combination of both per item 2) without special-casing any of them: this
card's contribution to a scored slice is the slice's value *with* the card,
minus its value with that one card removed and nothing else changed. That
marginal-contribution number is exactly the quantity a doubling tile should
double — the amount this specific card added — and it is what `cardContribution`
in the new `src/rooms/scoring.ts` computes, purely through `lens.evaluate`,
so it works unmodified for every counter and combination the game has.

Clamped the contribution at zero rather than letting it go negative. Poker's
`partialHands.scaleByLength` makes this a real, reachable case, not a
theoretical one: a 5-card slice that matches nothing (High Card, 0 chips)
can have a 4-card sub-slice that scores a scaled partial hand worth *more*
than the full slice, so removing a card can raise the "without" value above
the "with" value. A bonus tile should never let that arithmetic turn into a
bigger loss, so `cardContribution` floors at zero and `scoring.test.ts`
covers it directly with a contrived `Lens` built to trigger exactly that
shape (a fake `evaluate` that scores a 2-card input lower than a 1-card
input), independent of poker's real numbers.

The second question was whether to touch `hex/board.ts`'s `scoreHexPlacement`
directly (add a `tiles` parameter) or wrap it. Wrapped it: that function is
shared with the untouched sprawl mode (`useRun.ts`, `hex/game.ts`), and
threading a room-only concept through code the old mode also runs risks
exactly the kind of merge-time regression the standing rules exist to
prevent. `scoring.ts`'s `scoreRoomPlacement` calls the plain, unmodified
`scoreHexPlacement` first, then `applyTileEffects` post-processes the result
if there's a `cardMultiplier` tile at the placed cell — `hex/board.ts` has
zero lines changed by this item, confirmed with `git diff --stat`.

A tile's bonus only applies to a line whose *scored window* actually
contains the placed cell. `bestWindow` (unchanged, `hex/board.ts`) picks
whichever contiguous stretch of a line scores highest, and on a line longer
than `cfg.hexWindow` that stretch can fall away from the cell just played —
the tile only ever boosts the card that earned it, so a line the placement
didn't end up scoring gets nothing. `scoring.test.ts` covers this directly:
a strong two-card fifteen at the far end of a line beats the near-end window
containing the newly tiled cell, under a narrowed `hexWindow: 2`, and that
line's value is provably untouched.

One implication worth flagging rather than silently accepting: because the
tile is per-*cell*, not per-*line*, a card placed on a `cardMultiplier` tile
gets the bonus on *every* one of its (up to three) lines whose window
includes it, not just one chosen axis — a lone card in an empty
neighbourhood gets tripled on all three axes from a single ×3 tile, since
each of its three lines is that same one card. That reads as intended given
the item's own wording ("every line through it"), and is exactly what
`scoring.test.ts`'s "doubles a lone card's contribution on every one of its
three lines" test locks in, but it does mean a card-multiplier tile in an
empty pocket of the board is worth more than the same tile on a busy line
with only one axis carrying real cards. Left as-is rather than capping it to
one line — nothing in the item's text or ROOMS.md's decisions asks for a
cap, and item 22's calibration pass is the right moment to discover whether
that's a balance problem, not a guess made here.

`Tile` gained the new `{ kind: 'cardMultiplier'; multiplier: number }`
member and a `tileBadge(tile)` function, rather than a shared `label` field
on the union — a marker's badge is arbitrary text it carries, a
multiplier's badge (`×2`, `×3`) is derived from its number, and forcing both
kinds through one `label` field would mean either storing a redundant
string on every multiplier tile or leaving it stale if the multiplier ever
changed. `RoomBoardView` and the pre-existing `tile.test.ts` assertions on a
marker's text both switched from `tile.label` to `tileBadge(tile)` — the
compiler caught every call site that needed the change, since `.label` no
longer exists on the union as a whole.

`ROUND_ROOM` keeps its item-8 `'marker'` tile at `(1,0)` untouched and adds
one `cardMultiplier ×2` tile at `(0,-1)`, a different cell, specifically so
the existing smoke sequence's three hard-coded scores (7, 31, 73 at `(2,0)`,
`(1,0)`, `(0,0)`) stay exactly what they were — this item extends the
sequence with a fourth placement rather than risking the first three by
reusing their cell.

**Not done this item, on purpose.** No line-multiplier tile (item 10's job —
a different decision, since a letter square rewards a big card and a word
square rewards a big line). `HOURGLASS_ROOM` got no tile, same reasoning
item 8 gave for leaving it bare: one room proving the effect is enough.

**Item 10.** The real design question the item's own text raises but doesn't
settle: item 9's card square applies to *every* line through the tile (up to
three axes), and the item's phrase "double the total of **one** line" reads,
on its own, like it might mean something narrower — pick the single
best-scoring axis and multiply only that one. Rejected that reading. The
item's very next sentence resolves what the "different decision" actually
is: "letter squares reward a big card, word squares reward a big line" — a
statement about which *quantity* gets doubled (a card's own marginal share
versus the line's whole total), not about how many axes qualify. Nothing in
ROOMS.md's decision table or item 9's own precedent suggests a card-square
and a line-square should behave differently on axis count, and doing so
would need its own justification this item's text doesn't supply. So
`lineMultiplier` reuses item 9's exact per-axis mechanic (every line whose
*scored window* contains the placed cell gets the bonus) and only the bonus
formula itself changes: `line.window.result.value * (multiplier - 1)`
instead of `cardContribution(...) * (multiplier - 1)`. Said explicitly in
`scoring.ts`'s header that the "pick only the best line" reading was
considered and set aside for item 22's calibration pass to revisit if the
uncapped-axis-count design (already flagged as a possible balance question
in item 9's own log) turns out to need it — not resolved by a guess here.

Implementation reused item 9's substrate rather than duplicating it:
`applyTileEffects` no longer special-cases `cardMultiplier` — it now calls a
new `tileLineBonus(tile, line, cardIndex, lens, cfg)` for whichever tile
kind sits at the placed cell, which returns the line's bonus-and-label pair
for `cardMultiplier`, `lineMultiplier`, or `null` for `marker`/anything
else. The window-mutation code below it (append a `ScoreItem`, bump
`.value`, recompute the placement total) is untouched from item 9 and now
shared by both kinds — there was nothing kind-specific left in it once the
bonus computation itself moved into `tileLineBonus`.

The other real decision was the badge. `cardMultiplier` already badges as a
bare `×N` (locked in by item 9's own tests), and a `lineMultiplier` tile
carrying the same number would render an identical badge with no way to
tell which kind is which by looking at the board — a real ambiguity, not a
cosmetic nitpick, since the two kinds now genuinely behave differently on
the same board. `lineMultiplier` badges as `L×N` (Scrabble's own
convention of prefixing "DL"/"DW"-style letters was the model) rather than
touching `cardMultiplier`'s established format, which item 9 already
shipped and tested.

`ROUND_ROOM` gained one `lineMultiplier ×2` tile at `(-1,-1)` — adjacent to
the existing `cardMultiplier` tile's cell `(0,-1)` so the established
four-move smoke sequence (`(2,0)` → `(1,0)` → `(0,0)` → `(0,-1)`) still
satisfies adjacency for a fifth move onto it, and inside the radius-2 disc
(`hexDistance((-1,-1), origin) = 2`). `HOURGLASS_ROOM` stays bare, same
reasoning items 8-9 already gave: one room proving each new tile kind is
enough, adding a second tests nothing new. Verified with a throwaway script
against `expedition.ts` directly (run and discarded, not committed, same
convention as items 7-9) rather than guessed: the same fifth card at
`(-1,-1)` scores 58 with no tile there and 115 with the `L×2` tile there —
a 57-point boost, exactly `2 × 58 - 58`, confirming the whole line doubled
rather than some fractional card-share of it.

Considered whether a cell could ever carry both a `cardMultiplier` and a
`lineMultiplier` at once (stacking a letter and a word square, as real
Scrabble boards do). `tileAt` returns at most one `Tile` per cell by
construction — `TileMap` is `ReadonlyMap<string, Tile>`, one value per key —
so a stacked cell isn't representable without a further type change. Left
alone rather than widened: nothing in the item's text or ROOMS.md's
decisions asks for stacking, and speculatively supporting it now would be
doing item 22's (or a future item's) design work early for a combination
nobody has asked to ship.

**Item 11.** The simplest of the four tile kinds so far: `{ kind: 'blocked' }`
has no fields at all, because there is nothing to configure about a cell
that just cannot be played on — no multiplier number, no arbitrary label.
Its one effect lives in `expedition.ts`'s `isLegalRoomPlacement`, as one new
`tileAt(room.tiles, h)?.kind === 'blocked'` check placed right after the
existing occupied-cell check (the two read almost identically: an occupied
cell and a blocked cell are both "this coordinate is otherwise a real room
cell but off-limits right now/forever"). `scoring.ts` needed one line, not a
new code path: `tileLineBonus`'s switch grew a `'blocked'` case falling
through to the same `return null` as `'marker'` — TypeScript's exhaustiveness
check on the switch (no `default` branch) caught that this was needed the
moment the union grew, which is exactly the kind of compiler-verified
completeness the project has leaned on since item 9's `.label` → `tileBadge`
rename.

The one real design question, raised but not settled by the item's own text:
should a `'blocked'` tile be barred from sitting on an exit cell, the way
`makeRoom` already bars an exit from sitting outside the room or off the
border? Considered adding that validation and rejected it, on the strength
of item 8's own precedent test — "a tile can sit on an exit cell — a tile and
a doorway are independent facts about a cell" — which was written generically,
not scoped to markers. A room with more than one exit (both hand-authored
rooms have two) stays clearable through its other exit even if one were
blocked, so "blocked + exit" isn't automatically a broken room the way, say,
an exit outside the room's own cells always is; it would only be a broken
room if *every* exit were blocked, which is a stronger, room-wide invariant
this item's "cheap" framing doesn't ask for and neither hand-authored room
needs — `ROUND_ROOM`'s new blocked cell at `(1,-1)` isn't an exit or
adjacent to either exit's only approach, so the question never actually
arises there. Left as a documented non-decision rather than silently
resolved either way, for whichever later item (room archetypes, item 19, or
seeded generation, item 20) first needs to author a room where it matters.

`ROUND_ROOM` gained one `{ kind: 'blocked' }` tile at `(1,-1)` — adjacent to
the existing marker (`1,0`) and card-multiplier (`0,-1`) tiles, inside the
radius-2 disc, and not part of the established five-move smoke sequence
(`(2,0)` → `(1,0)` → `(0,0)` → `(0,-1)` → `(-1,-1)`), so that sequence's four
hard-coded scores (7, 31, 73, 88, 115 from items 7-10) stay exactly what they
were — this item only adds a *rejected* click, never a scored one, so there
was nothing here that could perturb those numbers even in principle.
`HOURGLASS_ROOM` stays bare, same reasoning items 8-10 already gave: one room
proving each new tile kind is enough.

Considered — and set aside — putting the blocked tile in the hourglass's neck
instead, specifically to *dramatise* "makes reach a real problem" the way the
item's own text puts it. Worked out on paper why that would prove less than
it looks like it would: `structureReachesExit` only requires *some* connected
piece of the structure to touch *some* exit (item 5's own design, not new
here), and the hourglass already has one exit per chamber — blocking any of
the three one-wide neck cells would fully sever the two chambers from each
other (no lateral space to route around a one-cell-wide neck) but a
structure built entirely within either chamber alone already reaches that
chamber's own exit without ever needing the neck. So the dramatic-looking
version would not actually demonstrate a constrained *route to an exit*, only
an severed path between two independently-exitable halves — a different, less
interesting claim than the one the item is making. A blocked cell that
narrows the *approach* to a single exit inside one room, without another exit
to fall back on, is the shape that would actually demonstrate the pathology —
that is a room-authoring question for item 19/20, not something to force into
today's two placeholder-threshold rooms.

**Backlog change, after item 11 (added in conversation, not by a firing).**
Inserted section C½ — items 13b, 13c and 13d — and rewrote item 22. Reason:
items 4-11 built rooms and nothing has measured one. The probe plays configs
on grid and hex boards; it has no room path, and all three of its agents pick
by score alone, so no agent has any reason to walk toward an exit. A room's
reach condition would be satisfied by accident or not at all, which means
`clear%` today would measure the agents' blindness rather than the design.

The order inside C½ is deliberate and is the reverse of the obvious one.
Deeper search looks like the upgrade, but a depth-6 score maximiser has
exactly the same problem as the depth-2 one — it still never walks to the
door. So: 13b is the prerequisite, 13c is the item that actually decides
whether the reach-and-score dual condition does anything, and 13d is a
refinement worth having but not worth waiting on. They sit after item 13 so
the room feature set (tiles, blocked, traps, artifacts) is complete when the
probe learns to see it, and before section D so no carried-item effect is
designed against numbers nobody has.

Two stale baselines fixed at the same time, both dangerous in the same way.
Item 22 asked whether choice spread had "come down from the hex sprawl's
15.5", and the top of this file quotes a lookahead lift of 1.26–1.43. Both
are pre-additive — measured against chips × mult, which item 1 retired. Item
3's recalibration puts hex sprawl at a spread of **4.3** and a lift of
**1.12**. Left alone, item 22 would have compared a room against a figure
from a scoring model that no longer exists and reported a pass it had not
earned, purely because the units changed underneath it. This project has had
to void published numbers twice already over measurement bugs; this would
have been the third and the least excusable, because it was written down in
advance.

Deliberately not done: nothing was unticked, no shipped item was reopened,
and the existing grid/hex probe rows are explicitly required to stay
byte-identical. C½ adds measurement; it does not revisit anything items 1-11
concluded.

**Item 12.** `{ kind: 'trap' }` has no fields, same reasoning as `'blocked'` —
there is nothing to configure about a trap beyond where it sits. The one real
design question the item's own text raises without settling it: a trap has
*state* ("hidden before, revealed on trigger") that every earlier tile kind
lacked, and that state does not belong on `Tile`/`Room` the way a
`cardMultiplier`'s number does. A `Room` (via `shapes.ts`) is static data
replayed across every expedition that plays it; "has this particular trap
already sprung" is a fact about *one playthrough*, not the shape. So
`ExpeditionState` gained a new field, `revealedTraps: ReadonlySet<string>`
(hex keys), rather than the trap tile itself carrying a hidden/revealed flag —
the same static-vs-dynamic split item 8's own decisions log already drew for
"which cells have traps" versus "which traps have been sprung this run",
just now actually needed instead of hypothetical. It resets to an empty set
on every room transition in `leaveRoom`, alongside the board and score, since
a fresh room's traps are all unsprung regardless of what happened in the
last one — proven directly in `expedition.test.ts` with two rooms that reuse
the same trap coordinate.

Trigger geometry ("on or beside") is a new pure function, `trapCellsNear(room,
h)` in `room.ts` — `[h, ...hexNeighbors(h)]` filtered down to cells actually
carrying a `'trap'` tile. Deliberately geometry-only, with no notion of
"already sprung": that split keeps `room.ts` free of any expedition-shaped
state, matching every other function in that file, and lets `expedition.ts`
do the one-line filter (`.filter((t) => !state.revealedTraps.has(hexKey(t)))`)
itself. A placement can, in principle, sit beside more than one still-hidden
trap at once (two traps sharing a neighbour) — `placeInRoom` handles that by
looping over every newly-triggered trap and charging one cost per trap, not
capping it at one trigger per placement; nothing in the item's text suggests
a placement should get a discount for triggering multiple traps at once, and
neither hand-authored room needs more than one trap to make the point, so
this is untested against a real two-trap room — noted here rather than
silently assumed correct.

The other real design question: which card, from hand or deck, and which
one specifically. The item's own text offers a choice ("hand *or* deck")
without saying how to pick, and nothing on `ExpeditionState` carries an RNG
stream past the seed's one-time use in `shuffledDeck` — reaching for
`Math.random()` here would make the same seed produce different runs, which
none of `newExpedition`'s design has ever allowed. Resolved deterministically
instead: a sprung trap takes the deck's own top card if the deck has one (the
card that would otherwise have been drawn next), falling back to the front
of the hand only once the deck is empty. Taking from the deck first, not the
hand, was a real choice, not the only reasonable one — it means a trap
usually costs you a card you never see rather than one sitting in your hand,
which reads as "the room takes a toll on what's left to draw" rather than
"the room reaches into your hand," and it also means the common case (deck
non-empty) never touches hand bookkeeping at all, which is one less place for
the "silently losing the wrong card" bug the item's own text warns about to
hide. Order matters for correctness, not just phrasing: the trap's cost is
paid *before* the normal end-of-turn refill draw runs, computed off the
post-trap-cost hand length, so the refill (when the deck still has cards
left after paying the trap) draws exactly enough from what the trap left
behind to top the hand back up, rather than under- or over-drawing against a
stale pre-trap count. The "falls back to a hand card once the deck is empty"
test exercises the sharpest version of this — deck and hand both shrink on
the same placement — and asserts the exact resulting hand length, not just
that it changed.

Accounting is the one thing this item's own text says to test carefully, so
`expedition.test.ts` doesn't just check that a card moved — it checks the
*count*: `next.deck.length + next.hand.length + next.board.size` is exactly
one less than before a sprung trap, and exactly unchanged for a placement
that doesn't trigger one or that hits an already-revealed trap a second
time. That is the assertion shape that would have caught "lost the wrong
card" (a card vanishing from the wrong pile still balances a size-only
check) as well as "lost no card" or "lost two" — a pure `.length` comparison
on one pile would not have.

`scoring.ts`'s `tileLineBonus` switch grew a `'trap'` case falling through to
the same `return null` as `'marker'`/`'blocked'` — the exhaustiveness check
caught it the moment the union grew, same as items 9-11. A trap has no
scoring effect; `scoreRoomPlacement`'s only per-placement side effect from a
trap is the card cost, applied in `expedition.ts`, not `scoring.ts`.

`RoomBoardView` needed a genuinely new prop, `revealedTraps`, since "hidden"
here means something none of the earlier four tile kinds ever needed:
*no visible difference from a plain cell at all*, not just a distinct badge.
A trap tile whose key isn't in the given set is treated as if `tileAt` had
returned nothing — no badge, no tint, indistinguishable from an empty room
cell — which is also why `data-room-tile` reads as absent (not `"trap"`)
before the reveal, so the smoke test can assert on hiddenness with the same
attribute every other tile kind already exposes rather than a bespoke one.
Once revealed it gets a fifth cell tint (rose), inserted into the background
chain after `'blocked'` but, in the boxShadow chain, *after* `occupied` too —
unlike `blocked` cells (which can never be occupied, since they reject
placement outright) a trap can absolutely have a card sitting on it, and the
existing gold occupied ring stayed the higher-priority signal there; the
skull badge above the card (item 8's "underneath the card" convention)
already carries the "this was a trap" information once a card has landed.

`ROUND_ROOM` gained one `{ kind: 'trap' }` tile at `(-2,1)` — deliberately
not adjacent to any of the room's other four tiles or to any of the five
cells the established smoke sequence (items 7-10) had already placed on, so
it stays genuinely hidden through all of them rather than firing as an
accidental side effect of an earlier move. Extended the sequence with a
sixth real placement, hand[0] onto `(-1,0)` — a plain cell that neighbours
the trap without sitting on it, chosen over landing directly on the trap
cell so the smoke test demonstrates the "beside" case specifically, not
just the more obvious "on" one. `HOURGLASS_ROOM` stays bare, same reasoning
items 8-11 already gave: one room proving each new tile kind is enough.

**Item 13.** The item's own text ("joins your deck when your structure
connects to it") does not say what "connects" means once an artifact cell
turns out not to be placeable. Considered, and rejected, treating an
artifact cell like an exit (a normal, placeable cell — "touch" is
occupancy, per item 5's own precedent) purely because it re-uses existing
machinery: "a card sitting on the board" reads as a card that is already
there, an occupant, not an empty tile waiting for one — the same reading
item 8-12's tile kinds all share for whatever physically sits on a cell
(rubble, a hidden spring). Went with the trap's geometry instead: `{ kind:
'artifact'; card: Card }`, rejected by `isLegalRoomPlacement` the same way
`'blocked'` is, and collected via a new `artifactCellsNear(room, h)`
(`room.ts`) — the exact same "on or beside" query as `trapCellsNear`, kept
in that shape rather than narrowed to neighbours-only even though "on" can
never fire in practice (the cell is never a legal placement target), so the
two stay obviously parallel rather than one silently depending on the
other's legality rules to be correct. Unlike a trap, an artifact carries no
hidden/revealed state — "the reason to detour" only works if the reward is
visible before you commit to going there, the opposite of a trap's whole
point — so `tileBadge` shows the artifact's own card label (`A♠`) rather
than a fixed glyph, and `RoomBoardView` renders it identically before and
after collection except for a dimmed tint (see below), never hidden.

State that differs run to run — "has this specific artifact already joined
the deck this room" — lives on `ExpeditionState.collectedArtifacts`
(a `ReadonlySet<string>` of hex keys), resetting to empty on every room
transition in `leaveRoom`, exactly mirroring `revealedTraps`'s split
between `Room`'s static shape and one playthrough's state (item 12's own
decisions log already drew this line; item 13 just needed it a second
time). `placeInRoom` computes `artifactCellsNear(room, h)` filtered against
that set, same shape as the trap loop immediately above it in the
function, and processes collection *after* trap costs but *before* the
end-of-turn refill draw — a newly collected artifact is exactly as
eligible to be drawn into hand this turn as any other deck card, not stuck
waiting a full extra placement to become available. No room built so far
puts a trap and an artifact within triggering range of the same placement,
so this ordering is untested against that specific interaction — noted
here rather than silently assumed correct, same as item 12's own
one-placement-triggers-two-traps gap.

Where in the deck a collected card joins was a real choice, not a forced
one. "The reason to detour" reads as *reward*, so it should feel available
soon, not buried — pushed to the *front* of the deck (`[...cardsGained,
...deck]`), the same "next to be drawn" position a trap's cost is paid
from (item 12), so `cardsGained` on the log entry reads as `cardsLost`'s
mirror image rather than an unrelated mechanic. No RNG stream exists on
`ExpeditionState` past the opening shuffle (same constraint item 12's own
log already noted), so a deterministic front-of-deck insertion was the
only reproducible option anyway, not merely the simplest one.

The card's own `id` needed to not collide with `freshDeck`'s own card of
the same rank and suit — `RoomRunPage`'s hand strip keys each card by
`card.id`, and two cards sharing an id is a real (if minor) React-key bug,
not just untidy data. `ROUND_ROOM`'s artifact card is `{ id: 'artifact-AS',
rank: 14, suit: 'S' }` — a real ace of spades for scoring and display
purposes, distinguishable by id from the deck's own `'AS'` if both are ever
in play at once (a chosen card was more interesting than a blank; nothing
about the mechanic requires this specific rank/suit).

The other real design question was rendering. A trap's rendering problem
was hidden/revealed; an artifact's is *collected/uncollected*, a fact that
needs to stay visible rather than toggling something on or off. Gave it a
sixth cell tint (gold, `rgba(250,204,21,.32)` uncollected) rather than
reusing any existing colour — every other special tint already means
something else (rose is a revealed trap, dark stone is permanently
blocked) — and dimmed it once collected (`rgba(161,138,66,.18)`, a muted
version of the same hue) rather than reverting to a plain cell's tint, so
"this was an artifact" stays legible as a landmark for the rest of the
room the way a discovered trap's rose tint does, not a fact that vanishes
the moment it stops mattering mechanically. `data-room-artifact-collected`
was added alongside the existing `data-room-tile` so the smoke test (and
any future one) can assert on collected state without parsing badge text
or colour. Cursor and legality share one `nonPlaceable` flag (`blocked ||
artifact`) rather than two separate checks, since both kinds reject a
click for the same underlying reason — something is already occupying the
cell.

`scoring.ts`'s `tileLineBonus` switch grew an `'artifact'` case falling
through to the same `return null` as `'marker'`/`'blocked'`/`'trap'` — the
exhaustiveness check caught it the moment the union grew, same as items
9-12. An artifact has no scoring effect of its own; the card that joins the
deck scores normally on some future placement, like any other card.

`ROUND_ROOM` gained one `{ kind: 'artifact', card: { id: 'artifact-AS',
rank: 14, suit: 'S' } }` tile at `(-1,2)` — chosen, like the trap's cell in
item 12, to sit outside adjacency range of every cell the established
six-move smoke sequence had already placed on, so it stays uncollected
until a placement deliberately detours there. Verified with a throwaway
script against `expedition.ts` directly (run and discarded, not
committed): the established six-move sequence (`(2,0)` → `(1,0)` →
`(0,0)` → `(0,-1)` → `(-1,-1)` → `(-1,0)`, scores 7, 31, 73, 88, 115, 70,
matching item 12's own log exactly — the new tile at a cell not adjacent
to any of these six never fires during them) extended with a seventh
placement, hand[0] onto `(0,1)` — beside, not on, the artifact at `(-1,2)`
— scoring **61** with no change from the artifact (an artifact grants a
card, not points) while `collectedArtifacts` gains `'-1,2'` and the whole
card pool (deck+hand+board) grows by exactly one, from the ace of spades
joining it. Final room score 407, carried into `runningTotal` after
leaving. `HOURGLASS_ROOM` stays bare, same reasoning items 8-12 already
gave: one room proving each new tile kind is enough.

**Item 13b.** All new code lives inside `tools/probe.test.ts` — no exported
function in `src/` changed shape, and every primitive the room façade calls
(`newExpedition`, `legalRoomCells`, `placeInRoom`, `scoreRoomPlacement`,
`roomEndState`, `currentStructure`) already has its own unit tests in
`expedition.test.ts`/`room.test.ts`/`scoring.test.ts`. So this item added no
new `src/__tests__` coverage — the standing "every new scorer/tile/item
effect gets unit tests" rule is about game logic, and there is none here to
cover; the façade is wiring, not a new rule.

The one real subtlety, worth stating because it is easy to get backwards: a
room's `status` never becomes `'complete'` on its own — only `leaveRoom`
does that, and item 13b's agents never call it (that is deliberately item
13c's job: "every agent today picks by score alone... a room is cleared
only by accident"). So a naive `while (s.status === 'playing')` loop, the
same shape `play()` uses for grid/hex, would spin forever the moment a room
is cleared with budget still unspent: `placeInRoom` itself no-ops once
`placementsLeft <= 0`, but nothing flips `status` away from `'playing'` in
that case, so the same (now-frozen) move list would keep getting re-picked.
`playRoom`'s loop condition is `s.status === 'playing' && s.placementsLeft >
0` specifically to make the budget itself the stopping rule, matching the
item's own framing ("a run is one room over its placement budget") rather
than relying on a status transition that, for a cleared room, never comes
without item 13c's agent existing to trigger it.

Followed from that: `roomEndState` only needs reading once, after the loop
exits, not on every placement. Reach can only go false→true over a room
(cards are never removed, so a structure's connectivity to an exit is
monotone), and score only goes up (every scorer, including the two
multiplier tiles, adds a non-negative amount — `cardContribution` is
clamped at zero and a multiplier bonus is only applied when it is positive,
per items 9-10's own decisions). So whatever `cleared` reads as at the end
of the budget is the true answer for the whole room, not an artifact of
stopping early.

Reused `greedy` and `carelessAgent` unchanged in behaviour — both only
touch `Move[]`, never the state argument — by making their previously-`AnyRun`
parameter generic (`<S>(_s: S, m: Move[]) => ...`) rather than widening
`AnyRun` itself to a three-way union with `ExpeditionState`. Widening
`AnyRun` would have made every existing grid/hex call site (`play`,
`lookahead`, `moves`) accept a room state they never actually receive, a
looser type for no benefit; the generic keeps each call site exactly as
narrow as it already was. `lookahead` itself could not be reused the same
way — it closes over a structure-dispatched `api(cfg)` — so `roomLookahead`
mirrors its shape one-for-one against `roomApi`/`roomMoves` instead of
trying to force a shared implementation across a grid/hex board and an
`ExpeditionState`, which do not share enough surface (no `targetScore`
short-circuit to neutralise, for one — see below) to be worth unifying.

Chose a **separate printed table** (`it('room comparison', ...)`, its own
header) over adding a `roomReach%` column to the existing `ruleset
comparison` table. The item's "leave the existing grid/hex rows
byte-identical" is unambiguous under a separate table — the existing
table's header, row-building code, and printed output are untouched by this
item, `git diff` confirms zero lines changed inside `it('ruleset
comparison', ...)` itself. Bolting a new column onto that table would have
meant every existing row's printed line grew a trailing `--`, which is
"change" by any literal reading even if the *values* stayed the same — a
risk not worth taking for a distinction the item's own next sentence
already resolves in a table-agnostic way ("the room rows get **a separate
honest column**"). Named the two new columns `reached%` and `clear%` — the
"two columns" the item's text asks for, reach and the reach-∧-score
conjunction — and deliberately not `reach%`, so there is no chance of a
reader conflating it with the existing edge-based proxy column one table up,
which keeps its old name and meaning for the grid/hex rows exactly as the
item requires.

Did not call `writeMetrics` for the room rows, so `metrics.generated.ts`
and `RulesetMetrics` (keyed by ruleset id, read by the existing Metrics
page) are untouched by this item — confirmed with `git diff
src/metrics.generated.ts` coming back empty after running `npm run probe`.
Folding room numbers into that shape is explicitly item 23's job
("Metrics for rooms... Rebuild the Metrics page"), not this one's, and
inventing a placeholder shape now would be doing that item's design work
early for a page that does not read rooms yet.

Used `CONFIG` (the same default the real `RoomRunPage` plays with — cribbage
counter, `roomPlacementBudget: 12`) rather than threading a config through
`ROOM_SHAPES`, since a `Room` carries no `Config` of its own — the scoring
lens, hand size and placement budget are expedition-level concerns, not
room-shape ones, exactly as `RoomRunPage.tsx` already assumes.

Both hand-authored rooms measured **100% reached and 100% cleared** for
greedy over 20 seeds — expected and not yet meaningful: both rooms' 50-point
thresholds are item 6's own placeholder ("gave both rooms the same round
placeholder... not tuned"), and a score-only greedy agent placing up to 12
cards, most of which touch the room's own two-cell-wide-at-most geometry,
reaches *some* exit almost by construction. This is precisely the
"accidental" clearing 13c exists to distinguish from a real one — the gap
between greedy's and a goal-seeking agent's clear rate is 13c's finding, not
this item's, and a 100%-vs-100% number here says nothing about whether the
reach condition bites. Recorded as a number, not a verdict.

**Item 13c.** All new code stayed inside `tools/probe.test.ts`, same as
13b — `goalSeekingAgent(room, w)` is agent logic for the probe, not a new
scorer/tile/item effect, so per 13b's own precedent (and the standing rule
being about game logic, not measurement tooling) there is no new
`src/__tests__` coverage; `nearestExitDist`'s only real dependency,
`hexDistance`, already has its own thorough test file.

The formula is exactly the item's own text, `v + w × reduction`, with
`reduction` defined as the drop in "distance from the structure to the
nearest exit" this placement would cause: `nearestExitDist` is the minimum
hex distance from any occupied cell to any exit, straight-line rather than
a real shortest path (the item calls for "the simplest form", and these
rooms are small enough — 17-19 cells — that a blocked route long enough to
make straight-line distance meaningfully wrong is unlikely). Reduction is
computed as before-distance minus after-distance, where "after" folds the
candidate cell into the structure; since a structure only ever grows and
the distance is a min over a growing set, `after <= before` always holds,
so `reduction` is never negative — a move that gets no closer just falls
back to plain greedy for that candidate. The one edge case needing an
explicit choice: an empty structure, before a room's first placement, has
no distance to reduce *from*. Defined `reduction = 0` for every candidate
on that turn rather than treating "no prior distance" as `Infinity` — the
latter would make the agent chase the nearest exit on turn one regardless
of `w`, overriding score entirely on the one turn where a *weighted*
trade-off is supposed to mean something.

Swept `w` over `[0, 1, 3, 10, 30]` (`w=0` is greedy itself, included as the
sweep's own baseline rather than assumed equal to the `greedy` column by
construction) across both rooms, 20 seeds each: every weight produced
identical **100% clear%** on both rooms, with median score essentially flat
(Round Room 1014-1024 across all five weights; Hourglass exactly 953 at
every weight). This is the ceiling effect 13b's results log already
flagged as the likely outcome: at a 50-point placeholder threshold, on a
17-19 cell room, with a 12-placement budget, a purely score-driven greedy
walk already lands on an exit almost by construction — there is no
headroom left in these two rooms for "wants to leave" to improve on, so no
`w` can be distinguished from any other on the metric that matters. Picked
`w=10` for the comparison table on a secondary ground, not a measured one:
it sits above the typical `reduction` range for a room this size (0-4) by
enough to matter once a real, harder threshold exists (item 22), without
being so large (`w=30`) that it would start overriding sound score choices
once ties actually exist to break. This is a bet aimed at item 22's rooms,
explicitly flagged in the code as needing revisiting once thresholds stop
being placeholders.

Extended the existing `room comparison` table (not the byte-identical
`ruleset comparison` one — that constraint was always specific to the
grid/hex table, and 13b's own table was introduced for exactly this kind of
extension) with two columns: `goalClear%` (the goal-seeking agent's clear
rate at `CHOSEN_W`, same seeds as the `greedy`/`clear%` columns for a fair
comparison) and `gap` (`goalClear% - clear%`), making the item's own
framing — "the gap between those two is itself the finding" — a printed
number rather something a reader has to compute by eye. Both rooms measured
**gap = 0**. Per the item's own text ("a gap near zero means the exit
condition is not biting"), this reads as an honest, expected non-finding
given the ceiling above, not a failure of the agent or the room design —
the dual reach-and-score condition has not yet been tested by anything in
this project, because no room has had a threshold set high enough to make
score the harder condition to satisfy. That test is item 22's, once 13d's
deeper search exists too and real thresholds replace item 6's placeholder.

**Item 13d.** All new code stays in `tools/probe.test.ts`, same as 13b/13c —
a deeper search agent for the probe is measurement tooling, not a scorer,
tile or item effect, so per those items' own precedent there is no new
`src/__tests__` coverage to add.

The mechanism is one generic `beamPick(start, m, depth, beamWidth, step)`,
shared by grid/hex (`beamSearch`) and rooms (`roomBeamSearch`) through a
`step` façade — the same seam `api`/`roomApi` already draw between the two
board kinds. It expands the current beam's moves one level, sorts by
cumulative value, keeps the top `beamWidth`, and repeats until `depth`
levels deep, returning whichever surviving path's *first* move scored
highest overall. This is a strict generalisation of `lookahead`
(`lookahead` is beam search with `depth=2, beamWidth=∞` restricted to the
root's top 12) — deliberately implemented as new code alongside it rather
than rewriting `lookahead` in terms of it, since the item's own text says
the deep column sits "beside the existing 2-ply lift... so the historical
column keeps its meaning" and touching `lookahead` at all would put that
at risk for zero benefit.

One real correctness question, not just a knob to tune: what does
"terminal" mean for a beam node mid-search? For grid/hex, `status !==
'playing'` is the whole answer. For a room it is not — 13b's own decisions
log already flagged that `placeInRoom` silently no-ops once
`placementsLeft` hits zero while `status` stays `'playing'` until
`leaveRoom` runs (nothing here calls `leaveRoom`). Missing that would have
been a real, quiet scoring bug: a beam node past its real budget would keep
"expanding" into identical no-op states while `total` kept adding move
values that were never actually played, inflating exactly the deepest,
most-multiplied levels of the search with fabricated score. `roomBeamSearch`'s
`terminal` checks `status !== 'playing' || placementsLeft <= 0` for exactly
this reason; `beamSearch`'s (grid/hex) only needs the status check, since
grid/hex has no equivalent silent-no-op budget.

Picked `DEEP_DEPTH = 4`, `DEEP_BEAM = 10` from the cost shape rather than a
guess: each non-root level costs up to `beamWidth` extra `moves()` calls (one
per surviving beam node), so a depth-4 search costs roughly `3 × beamWidth`
extra calls against lookahead's fixed 12 — at `beamWidth = 10` that is 30,
about 2.5× lookahead's own cost, deliberately on the conservative side of
the item's own "roughly 25×" estimate rather than aimed at it. Read that
estimate as a warning to budget for, not a target to hit: swinging
`beamWidth` up toward literally 25× (order ~100) risked a genuinely
multi-minute single test block for no stated benefit over a smaller,
still-meaningfully-deeper search, and the actual measured cost (below)
shows the conservative choice was still the more expensive problem, not the
safer one.

Measured, not assumed: adding the deep agent took the `ruleset comparison`
test from item 3's own logged ~51.6s to ~215s — about 3.2× the three-agent
baseline it's added to, close to the 2.5× estimate above once `play()`'s own
non-`moves()` overhead (board updates, per-turn bookkeeping) is folded in.
Well under `vitest.probe.config.ts`'s 600s `testTimeout`, so the item's own
contingency ("if `npm run probe` runs past its timeout, cut the seed count
for the deep agent only") was never triggered on that specific timeout —
all four agents ran the full `SEEDS = 20` everywhere, no sample was
shortened.

**What did go wrong, and was fixed rather than worked around by cutting
seeds.** The first full run of the recalibrated probe exited non-zero —
`Test Files 1 passed (1)` and `Tests 3 passed (3)`, but a separate
"Unhandled Error: [vitest-worker]: Timeout calling 'onTaskUpdate'" still
failed the process. This is a different timeout from `testTimeout`: vitest's
worker/main-process RPC heartbeat, which the fully-synchronous `ruleset
comparison` test body (no `await` anywhere in the loop, one giant blocking
JS call) never yielded control back to, for the ~215s the deep agent pushed
the total past. Confirmed by reproducing it a second time identically before
touching anything, then fixing it with one `await new Promise((resolve) =>
setTimeout(resolve, 0))` per ruleset inside the loop rather than reducing
`SEEDS` for the deep agent — yielding to the event loop doesn't change a
single computed number (the probe's RNG is seeded, nothing reads the wall
clock), so this recovers the honest fix (full sample, every agent, every
ruleset) rather than the item's fallback (a documented smaller sample) for a
problem that was never actually about running past `testTimeout` at all.
Verified by rerunning: same 30×4-agent table, byte-identical numbers to the
failing run, exit code 0. `goal-seeking weight sweep` and `room comparison`
stayed well under a minute each (1.4s, ~13s) and needed no such fix.

`deep`/`deepLift` were deliberately not threaded into `measured` /
`writeMetrics` in the `ruleset comparison` test — `git diff --stat` after
the full run confirms `src/metrics.generated.ts` is untouched. Same call
13b/13c already made for the room table: widening `RulesetMetrics` and the
Metrics page that reads it is item 23's job, not this one's, and adding a
column nothing displays yet would be doing that item's work early for a
shape likely to change once it actually happens.

One finding the numbers themselves surfaced, worth flagging rather than
smoothing over: `mech-lock-cash`'s `deep` median (180) came in *below* its
`2ply` median (192) — a beam search that's supposed to look further ahead
did measurably worse than the shallower one on this specific ruleset. Not a
bug: `lookahead` evaluates the root's top-12 candidates exhaustively with
one guaranteed follow-up each, while `beamPick` culls to the top-`beamWidth`
(10) *cumulative* path after every level, which can prune away a
candidate that only pays off several moves later — exactly the kind of
sequence `mech-lock-cash`'s bank-then-cash mechanic rewards (its own
long-standing ruleset comment already says greedy has no gradient to follow
there). A beam that's too narrow for a specific mechanic's reward shape can
search deeper and still find less. Recorded as data, not corrected by
hand-tuning `beamWidth` up for one ruleset — the standing rule is not to
tune by eye, and this is exactly the texture a later calibration pass (item
22, or a dedicated look at `mech-lock-cash`) should use, not something to
paper over here.

**Item 14.** New file `src/rooms/item.ts`: `Item` is a union of exactly one
member, `{ kind: 'placeholder'; label: string }` — the same "one proof-of-
substrate kind, real kinds arrive with the items that need them" shape item
8's header used for `Tile` before items 9-13 gave it real kinds. No render
concern parallels item 8's badge-placement problem here, since an item lives
in the inventory, not on a board cell.

The harder call was what shape the "one place where item effects apply"
hook should take. `applyTileEffects` (`scoring.ts`) is a score
post-processor because a tile's effect *is* a score change. The
pre-declared decision table says the opposite for items — "tools that
change rules (sight, movement, counting), not stacked score multipliers" —
and item 15's own text ("grants a counting method... using item 2's
machinery") points specifically at `Config.secondLensId`, a rules field, not
a score delta. So `applyItemEffects(cfg: Config, items: readonly Item[]):
Config` is a `Config` transform, not a placement post-processor: given the
expedition's inventory, it returns the config actually in force. With no
real kind yet this is the identity transform (`items.reduce` over a
`switch` with one arm that returns its accumulator unchanged), proven in
`item.test.ts` by reference equality (`applyItemEffects(CONFIG, [])`
and `applyItemEffects(CONFIG, [placeholder, placeholder])` both `toBe`
the same `CONFIG` object, not just deep-equal).

`ExpeditionState` gained `items: Item[]`, initialised to `[]` in
`newExpedition`. The one design decision with real teeth: unlike
`revealedTraps`/`collectedArtifacts`, `items` is *not* reset in `leaveRoom`
— the pre-declared decision table is explicit that "deck, inventory,
running total" are what persists between rooms, placement budget the one
per-room thing. Since `leaveRoom`'s room-transition object literal already
builds off `{...state, ...}` and simply never mentions `items`, this needed
no new code, only *not* adding a reset the way `revealedTraps: new Set()`
got one — tested directly in `expedition.test.ts` ("survives a room
transition") rather than trusted to fall out of the diff by inspection.

`addItem(state, item): ExpeditionState` is the only way to add to
inventory — a pure append, same shape as `withHexCard`/`withTile`. Nothing
in this item grants one during play (that starts at item 15), so it exists
purely as the substrate's own write path and its test harness's way of
constructing a non-empty inventory to prove the hook is actually wired
through, not just present and unused.

Wiring: every site in `expedition.ts` that already took a bare `cfg` now
computes `applyItemEffects(cfg, state.items)` before using it —
`isLegalRoomPlacement`'s adjacency check and `placeInRoom`'s call into
`scoreRoomPlacement`. Both functions already receive `state`, so this
needed no new parameters anywhere, and since `applyItemEffects` returns the
identical `cfg` reference whenever `items` is empty, every existing test
and every existing ruleset behaves exactly as before — confirmed by the
full suite passing unchanged (342/342, up from 335 by exactly the 7 new
tests this item added) rather than assumed from the identity-transform
argument alone.

`RoomRunPage` grew one line, `Items: {list or 'none'}`
(`data-expedition-items`), next to the running-total label — visible and
screenshotable per the standing rule, the same reasoning item 4's dev
preview and item 8's marker tile used, even though nothing in this item can
make it read anything but "none" during actual play. Extended the smoke
test at both ends of the existing room sequence (right after the page
opens, and again after the room transition) to assert exactly that text,
rather than skipping smoke coverage on the grounds that "nothing happens
yet" — a substrate that silently fails to render is exactly the kind of
regression a later item's own smoke assertions would misattribute to
itself.

**Item 15.** The mechanism needed almost nothing new: `Item` gained
`{ kind: 'secondCounter'; lensId: LensId }`, and `applyItemEffects`'s new
switch arm just writes `item.lensId` into `Config.secondLensId` —
`getScoringLens` (already called by every scoring site downstream of
`applyItemEffects` since item 14 wired the hook through `isLegalRoomPlacement`
and `placeInRoom`) does the actual combining, via `combineLenses`, exactly as
it already does for a ruleset that ships a combo from the start
(`combo-cribbage-poker`). Item 14's own closing note said as much: "that
guarantee [`applyItemEffects` returning the identical `cfg` reference with
zero or inert items] is what item 15 needs verified before it can safely
assume 'no items' and 'some inert items' behave identically" — true here,
confirmed by the full suite passing unchanged before this item's own new
tests were added.

Mirrored `setup.ts`'s own `normalise` rule (a `secondLensId` equal to
`lensId` collapses to `''`, since scoring a line under the same counter
twice would double it for no reason) rather than reinventing it: if the
granted `lensId` already matches the room's primary counter, the switch arm
returns `acc` unchanged (same reference), not a `Config` with
`secondLensId` set to the same value as `lensId`. This matters concretely
with only two lenses in the game (`poker`, `cribbage`) — a room whose
primary counter is already the one the item would grant treats the item as
a genuine no-op rather than silently duplicating a counter that was already
active. Two `secondCounter` items carried at once collapse to whichever one
last wrote a real (non-matching-primary) value — `Config` only has room for
one second lens (item 2's own single-field design), so a third counter
was never representable and this item doesn't change that; documented and
tested (`item.test.ts`) rather than left as an unstated limitation, the same
way item 2's own log flagged its single-field choice as a real constraint,
not an oversight.

The harder question was acquisition, and the honest answer is that nothing
in the backlog specifies one. The item's own text ("Item: a second
counter... using item 2's machinery") describes the *effect*, not how a
player comes to carry it, and no item from 15 through 18 mentions a pickup
mechanism — unlike item 13's artifact, there is no "card sitting on the
board that joins your [inventory] when your structure connects to it"
equivalent for items anywhere in this file. Designing one here would be
doing a future item's (or an unwritten item's) design work early for a
shape likely to be wrong — the same reasoning item 8/14's own headers gave
for not guessing at unshipped kinds. So `RoomRunPage` grew a small, clearly
labelled dev affordance instead — a "Dev: pick up cribbage counter" button
that calls `addItem` directly — documented in the component itself as a
stand-in for a real pickup, the same role item 4's "(dev preview)" page and
item 5/6's click-to-toggle stand-in structure played before the real
mechanics existed. It grants `{ kind: 'secondCounter', lensId: 'cribbage' }`
specifically (not a room's own primary lens) because `CONFIG.lensId` is
`'poker'` — granting `'poker'` again would be the identity no-op case above,
which proves nothing new happened. The button self-disables once that exact
item is already carried, so it can't be clicked twice to no further effect
and read as broken.

The strongest available demonstration turned out to require no contrivance:
worked out offline (a throwaway `vite-node` script against `expedition.ts`
directly — a new tool for this convention, since the earlier
throwaway-script items ran under `vitest`/discarded test files, but the
project has no compiled-JS entry point to run a plain script against
TypeScript sources through; `vite-node` was already a dependency, so this
reused existing tooling rather than adding one — run and discarded, not
committed) that the same card (the ace of spades already in hand entering
the Hourglass, per item 13's own log) landing on the Hourglass's own north
exit scores **46** under poker alone — reached, but short of the room's
50-point threshold — and **59** once cribbage is carried as a second
counter — reached *and* past the threshold. The item is not just a bigger
number here; it is the entire difference between a near-miss and a clear on
the exact same move. Verified live in the browser, not just offline (see
results log) — the running app produces the identical 46→59 boost and flips
`cleared` from `false` to `true` on the same click.

Extended the smoke test past the point item 14 left it (right after
"inventory still reads none after a room transition", still in the fresh
Hourglass): clicks the dev pickup button, asserts the inventory line reads
`Items: Cribbage (2nd counter)` and that the button itself disables, then
places hand[0] on the room's north exit and asserts both the exact boosted
score (`scored 59`) and that the room reads `cleared` — the offline 46
number is referenced in a comment for context but not asserted live, same
convention items 9/10 used for their own offline-computed "without the
tile" baseline.

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

**Item 7.** `npm test` 269/269 (was 253 — 16 new in `expedition.test.ts`:
opening deal, legality inside/outside the room, adjacency once a room is
bigger than one ring, placement scoring/budget/log bookkeeping, four no-op
cases, live reach/clear tracking, deck-and-hand-intact room transitions,
running-total accumulation across two cleared rooms, expedition completion
on the last room, and both directions of the stuck-vs-cleared failure
judgment call). `npx tsc -b --noEmit` clean. `npm run smoke` 39/39 (was 34
— the 11 dev-preview checks driving click-toggle stand-ins are gone, along
with the page they drove; 16 new checks drive a real room-to-room run
instead: opens on Round Room 1/2, places real cards via hand-index clicks,
shows a rendered card face on the placed cell, tracks reach/short/cleared
live exactly as item 6 did but off real placements instead of a stand-in
score field, disables/enables "Leave through exit" on the cleared
transition, and — the check this item exists to add — leaving carries the
score into the running total, lands on Hourglass 2/2 with an empty board,
a placement budget back at 12, and unchanged hand and reach state).

The exact sequence smoke asserts on (seed `rooms-1`, default `CONFIG`) was
worked out with a throwaway script against `expedition.ts` directly (three
variants — a greedy best-scoring-cell search, then a hand-in-order-0
straight-line walk — run and discarded, not committed) rather than guessed:
hand[0] onto `(2,0)` (the east exit — legal as the opening placement since
the board starts empty, so reach is true after move 1 at score 7), then
`(1,0)` (score 31, still short), then `(0,0)` (score 73, crossing the
threshold of 50 — the room reads cleared with 9 of its 12-placement budget
unspent, which is itself the point: clearing needs to reach *and* score,
not spend the whole budget). Picking hand-index 0 on every move rather than
tracking specific card identities matters because it is exactly how
`placeInRoom` refills a hand (the removed card's slot collapses and the
draw appends to the end), so replaying "click hand[0]" in the browser
reproduces the scripted sequence deterministically without the smoke test
needing to know or assert on any specific card.

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, run and
discarded, not committed) through the full sequence above:

| screenshot | shows |
|---|---|
| fresh Round Room | 19-cell disc, two green EXIT tiles, hand of 7, "placements left 12", "Not reached" / "Not cleared" |
| after placing on the exit | a real card face (2♣) sitting on the east exit tile, "Reached" but "Score 7 / 50 (short)" |
| room cleared | three placed cards visible on the board (a genuine 3-card line through the centre), "Reached" / "Score 73 / 50 (met)" / "Cleared", the "Leave through exit" button lit emerald |
| after leaving | header now reads "Room 2 / 2 — Hourglass" and "Running total 73"; the Hourglass renders with an empty board (no cards); the hand strip shows the exact same 7 cards as before leaving, proving "deck intact" visually and not just in the state object |

One real bug surfaced and fixed along the way, not just a placeholder
number this time: the first attempt sized a placed card's `CardFace` with
its default `md` geometry, which reads `width`/`height` off a global
`--cell` CSS variable pinned to the grid board's width — unrelated to a
room's own `size` prop, and the card visibly overflowed its hex tile in the
first screenshot. Fixed by giving `RoomBoardView` the same inline
`width`/`height`/`fontSize` formula `HexBoardView` already uses for its own
hex-mounted cards (`1.05 * size` etc.) instead of relying on `CardFace`'s
default sizing. Confirmed with a real measurement rather than a second
glance at a screenshot: `boundingBox()` on a placed card came back
46×59 inside a 76×88 tile, a 60%/67% fit — the identical ratio
`HexBoardView` produces for the sprawl's own cards. (A second screenshot
still looked oversized after the fix; that one was a leftover preview
server on the same port from the first screenshot run, not a real
regression — resolved by moving to a fresh port, not by touching the fix.)
No video — item 7 is a room-transition state machine, not movement or
feel; the four-screenshot sequence is the equivalent evidence for a
transition rather than a motion.

**Item 8.** `npm test` 279/279 (was 269 — 10 new in `tile.test.ts`: the
empty-map/withTile/tileAt/isTiled substrate, `tileMapFrom`, and
`Room.tiles` via `makeRoom` including the out-of-room rejection and a tile
coexisting with an exit on the same cell). `npx tsc -b --noEmit` clean.
`npm run smoke` 42/42 (was 39 — 3 new: the marker tile renders at `(1,0)`
before anything is placed there, it is still present after a card lands on
that same cell, and the card itself is also there — on top, not instead of).

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, run and
discarded, not committed, using a fresh port per item 7's own note about a
stale-port false positive):

| screenshot | shows |
|---|---|
| fresh Round Room, zoomed to just cell `(1,0)` | the "T8" badge legible near the top of the empty hex |
| same cell after a card is placed there | the badge still visible above the card (5♣), the card itself unclipped and fully legible below it |
| full board mid-run | both placed cards (`2♣` on the east exit, `5♣` on the tile cell) with the badge peeking above the second one, exactly the "underneath" effect the item asks for |

One real bug, not just a placeholder: the badge's first position (pinned to
the top-left corner) rendered as nothing at all — screenshotting the empty
tile cell in isolation showed a blank hex, not a faint or misplaced badge.
Traced to the hex's own `clipPath`, which clips its full subtree and leaves
almost no width near a pointy-top hex's corners; a corner-offset badge sat
entirely outside the clipped path. Fixed by centring the badge horizontally
in the hex's untouched top sliver instead — confirmed by re-screenshotting
the same isolated cell and seeing the badge appear, not by reasoning about
the CSS alone.

**Item 9.** `npm test` 291/291 (was 279 — 9 new in `scoring.test.ts` covering
`cardContribution` and `applyTileEffects`/`scoreRoomPlacement` (no-tile
no-op, marker-tile no-op, lone-card tripling/doubling across all three axes,
marginal-vs-whole-line distinction, the excluded-window case, and
non-mutation), plus 3 new in `tile.test.ts` for the `cardMultiplier` shape,
`tileBadge`, and coexistence with a marker tile in the same room). `npx tsc
-b --noEmit` clean, including catching every `tile.label` call site (two in
the pre-existing `tile.test.ts`) that needed to switch to `tileBadge` once
`Tile` became a real union — the compiler did that discovery, not a manual
audit. `git diff --stat src/hex/board.ts` shows zero lines changed, the
concrete check behind this item's "wrap, don't touch the shared scorer"
decision. `npm run smoke` 45/45 (was 42 — 3 new: the `cardMultiplier` tile
renders before anything is placed on it, placing on it scores the exact
boosted amount, and the post-boost score carries correctly into the running
total after leaving).

The exact numbers (seed `rooms-1`, default `CONFIG`, same throwaway-script
convention as items 7-8 — run directly against `expedition.ts`, discarded,
not committed): the established three-move sequence onto `(2,0)`, `(1,0)`,
`(0,0)` is untouched (scores 7, 31, 73, matching item 7's own log exactly,
confirming the new tile at a different cell didn't perturb it), then a
fourth placement of hand[0] onto the `×2` tile at `(0,-1)` scores **88** —
verified against the same card at the same board state with
`scoreHexPlacement` directly (no tile) scoring **50**, a 38-point boost from
one card's own marginal contribution across its three lines. Final room
score 161, carried into `runningTotal` after leaving.

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, fresh port per
item 7/8's stale-port note, run and discarded, not committed):

| screenshot | shows |
|---|---|
| zoomed on `(0,-1)` before placement | a centred "×2" badge in the hex's top sliver, same placement convention item 8 established for the marker |
| same cell after K♠ lands there | the "×2" badge still visible above the card, unclipped, the same "underneath" effect as the marker tile |
| full board after the fourth placement | both tiles visible at once (`T8` marker under `5♣`, `×2` multiplier under `K♠`), header reading "Score 161 / 50 (met)" / "Cleared", and the log line "Last placement: K♠ at 0,-1 scored 88" — the number the offline calculation predicted, not a rounded-off approximation |

No video — this item changes what a placement is worth, not movement or feel.

**Item 10.** `npm test` 299/299 (was 291 — 8 new: 3 in `tile.test.ts` for the
`lineMultiplier` shape, its `L×N` badge including that it's distinct from a
`cardMultiplier` badge carrying the same number, and coexistence with a
`cardMultiplier` tile in the same room; 5 in `scoring.test.ts` covering
whole-line doubling versus the card's own contribution (the direct contrast
with item 9's equivalent test), the lone-card three-axis case, ×3, the
excluded-window case, and non-mutation). `npx tsc -b --noEmit` clean —
including catching that `tileLineBonus` needed the `Tile` type imported into
`scoring.ts`, which the compiler flagged immediately. `npm run smoke` 47/47
(was 45 — 3 new: the `lineMultiplier` tile renders before anything is placed
on it, placing on it scores the exact boosted amount, and the post-boost
score carries correctly through the existing "leaving carries the score"
check, which needed no changes itself since it already read off a `finalScore`
variable rather than a hard-coded number).

The exact numbers (seed `rooms-1`, default `CONFIG`, same throwaway-script
convention as items 7-9 — run directly against `expedition.ts`, discarded,
not committed): the established four-move sequence onto `(2,0)`, `(1,0)`,
`(0,0)`, `(0,-1)` is untouched (scores 7, 31, 73, 161, matching item 9's own
log exactly — the new tile at a different cell didn't perturb it), then a
fifth placement of hand[0] onto the `L×2` tile at `(-1,-1)` scores **115** —
verified against the same card at the same board state with
`scoreHexPlacement` directly (no tile) scoring **58**, exactly double,
confirming the *whole* line doubled rather than a card-share of it. Final
room score 276, carried into `runningTotal` after leaving.

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, fresh port per
item 7/8's stale-port note, run and discarded, not committed):

| screenshot | shows |
|---|---|
| zoomed on `(-1,-1)` before placement | a centred "L×2" badge in the hex's top sliver, same placement convention items 8-9 established, visually distinct from a plain "×2" |
| same cell after A♣ lands there | the "L×2" badge still visible above the card, unclipped |
| full board after the fifth placement | all three tile kinds visible at once (`T8` marker under `5♣`, `×2` card multiplier under `K♠`, `L×2` line multiplier under `A♣`), header reading "Score 276 / 50 (met)" / "Cleared", and the log line "Last placement: A♣ at -1,-1 scored 115" — matching the offline calculation exactly |

No video — this item changes what a placement is worth, not movement or feel.

**Item 11.** `npm test` 305/305 (was 299 — 6 new: 3 in `tile.test.ts` for the
`blocked` shape, its fixed `▓` badge, and coexistence with a `lineMultiplier`
tile in the same room; 3 in `expedition.test.ts` covering `isLegalRoomPlacement`
rejecting a blocked cell, `legalRoomCells` excluding it while leaving the rest
of a small room's cells open, and `placeInRoom` being a true no-op on a
blocked target — same object identity, no placement spent, board untouched).
`npx tsc -b --noEmit` clean, including the exhaustiveness check on
`scoring.ts`'s `tileLineBonus` switch catching the missing `'blocked'` case
the moment the `Tile` union grew. `npm run smoke` 50/50 (was 47 — 3 new: the
blocked tile renders before anything is attempted on it, clicking it with a
card selected places nothing, and the placement budget is unaffected by the
rejected click).

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as items 7-10, fresh port, run
and discarded, not committed):

| screenshot | shows |
|---|---|
| zoomed on `(1,-1)` | a solid dark rubble-tinted hex with a centred "▓" badge, visibly distinct from the pink border tint neighbouring cells carry |
| full board | all four tile kinds visible at once — `T8` marker, `×2` card multiplier, `L×2` line multiplier, and the blocked cell as a flat black hex with no border/exit tint showing through it — after an attempted placement on it left the board still empty, "Score 0 / 50", and "placements left 12" unchanged |

The dark fill was chosen to override the border/exit/interior tinting
entirely rather than layer on top of it (a blocked cell inside the Round
Room's ring gets the same flat black regardless of whether it happens to sit
on the border), so a blocked cell reads as "not part of the playable shape"
at a glance rather than as a fourth thing to notice on top of the existing
three-tint system. No video — this item is a legality rejection, not
movement or feel.

**Item 12.** `npm test` 319/319 (was 305 — 3 new in `tile.test.ts` for the
`trap` shape, its `☠` badge, and coexistence with a blocked tile; 4 new in
`room.test.ts` for `trapCellsNear` covering "on", "beside", "neither", and
that it is purely geometric — same answer called twice, no notion of
already-triggered; 7 new in `expedition.test.ts`: starts hidden, triggers
and reveals on landing directly on a trap (costing exactly one card, checked
by the deck+hand+board pool shrinking by exactly one), triggers on landing
beside one, does not cost a second card once already revealed, a placement
nowhere near a trap costs nothing extra, the hand-fallback once the deck is
empty with an exact resulting hand length, and reveal state resetting to
empty on leaving a room even when the next room reuses the same trap
coordinate). `npx tsc -b --noEmit` clean, including the exhaustiveness check
on `scoring.ts`'s `tileLineBonus` switch catching the missing `'trap'` case
the moment the `Tile` union grew, same as items 9-11. `npm run smoke` 57/57
(was 52 at HEAD, confirmed by running it before this item's own changes —
item 11's own log undercounted itself as "50/50"; not corrected retroactively
here, just noted so this count is reproducible — 5 new: the trap tile is
absent from the DOM's tile attribute before anything triggers it, the
triggering placement scores normally (a trap costs a card, not points), the
tile attribute reads `'trap'` once revealed, the last-placement line reports
the card cost in the UI, and the final score after the trap-triggering
placement is exactly the pre-trap score plus that placement's own points).

The exact numbers (seed `rooms-1`, default `CONFIG`, same throwaway-script
convention as items 7-11 — run directly against `expedition.ts`, discarded,
not committed): the established five-move sequence onto `(2,0)`, `(1,0)`,
`(0,0)`, `(0,-1)`, `(-1,-1)` is untouched (scores 7, 31, 73, 88, 115,
matching item 10's own log exactly — the new trap tile at a cell not
adjacent to any of these five never fires during them), then a sixth
placement of hand[0] onto `(-1,0)` — beside, not on, the trap at `(-2,1)` —
scores **70** with no change from the trap (a trap costs a card, not
points) while `revealedTraps` gains `'-2,1'` and the deck drops by one extra
card (from 40 to 38 rather than the usual one-card refill dip) as the lost
card `7♦`. Final room score 346, carried into `runningTotal` after leaving.

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, fresh port per
item 7/8's stale-port note, run and discarded, not committed):

| screenshot | shows |
|---|---|
| zoomed on `(-2,1)` before anything triggers it | an ordinary pink border-tinted hex, no badge, indistinguishable from any other unremarkable border cell |
| the same cell after the sixth placement | a rose-tinted hex with a centred "☠" badge — visibly distinct from every other tile tint on the board |
| full board after all six placements | all five tile kinds visible at once (`T8` marker, `×2` card multiplier, `L×2` line multiplier, the blocked cell, and the now-revealed trap), header reading "Score 346 / 50 (met)" / "Cleared", and the log line "Last placement: 2♠ at -1,0 scored 70 — a trap sprang, costing 1 card" |

No video — this item is a hidden/revealed state flip and a bookkeeping
side effect, not movement or feel.

**Item 13.** `npm test` 335/335 (was 319 — 3 new in `tile.test.ts` for the
`artifact` shape, its own-card badge (distinct from a fixed glyph), and
coexistence with a trap tile; 4 new in `room.test.ts` for
`artifactCellsNear` covering "on", "beside", "neither", and that it does
not care about collected state, mirroring `trapCellsNear`'s own suite
exactly; 1 new in `scoring.test.ts` confirming an artifact tile has zero
scoring effect; 8 new in `expedition.test.ts`: rejects the artifact cell as
a placement target, starts uncollected, joins the deck on a "beside"
placement with the whole pool growing by exactly one, the gained card lands
at the front of the deck (next to be drawn — isolated with a second config
that produces no refill draw, so the deck's own order stays directly
observable), does not join a second time once already collected, a
placement nowhere near an artifact gains nothing extra, collecting costs no
placement and no card, and reveal-adjacent state resets to empty on leaving
a room). `npx tsc -b --noEmit` clean, including the exhaustiveness check on
`scoring.ts`'s `tileLineBonus` switch catching the missing `'artifact'`
case the moment the `Tile` union grew, same as items 9-12. `npm run smoke`
63/63 (was 57 — 6 new: the artifact tile renders before anything triggers
it, badged with its own card (`A♠`); it starts uncollected
(`data-room-artifact-collected="false"`); the triggering placement scores
normally; the tile flips to collected; the log reports the card gained;
and the final score after the artifact-triggering placement is exactly the
pre-artifact score plus that placement's own points).

The exact numbers (seed `rooms-1`, default `CONFIG`, same throwaway-script
convention as items 7-12 — run directly against `expedition.ts`, discarded,
not committed): the established six-move sequence onto `(2,0)`, `(1,0)`,
`(0,0)`, `(0,-1)`, `(-1,-1)`, `(-1,0)` is untouched (scores 7, 31, 73, 88,
115, 70, matching item 12's own log exactly — the new artifact tile at a
cell not adjacent to any of these six never fires during them), then a
seventh placement of hand[0] onto `(0,1)` — beside, not on, the artifact at
`(-1,2)` — scores **61** with no change from the artifact (a card sitting
on the board grants a card, not points) while `collectedArtifacts` gains
`'-1,2'` and the card pool (deck+hand+board) grows by exactly one, the ace
of spades joining the deck's front. Final room score 407, carried into
`runningTotal` after leaving.

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, fresh port per
item 7/8's stale-port note, run and discarded, not committed):

| screenshot | shows |
|---|---|
| zoomed on `(-1,2)` before anything triggers it | a bright gold hex with a centred "A♠" badge, distinct from every other tile tint on the board |
| full board just before the seventh placement | all five prior tile kinds visible (`L×2`, `×2`, `T8` marker, the blocked cell, the now-revealed trap) alongside the still-gold, uncollected artifact |
| the same cell after the seventh placement | the hex dims to a muted stone-gold, the "A♠" badge still legible — collected, not gone |
| full board after all seven placements | all six tile kinds visible at once, header reading "Score 407 / 50 (met)" / "Cleared", and the log line "Last placement: 5♦ at 0,1 scored 61 — an artifact joined the deck: A♠" |
| full page | the hand strip's last card is a fresh "A♠" — the artifact card drawn into hand by the very refill this same placement triggered, the clearest end-to-end proof the deck actually gained it, not just the state object |

No video — this item is a static "always visible, becomes collected" state
flip, not movement or feel.

**Item 13b.** `npm test` 335/335, unchanged from item 13 — this item added
no code under `src/`, only `tools/probe.test.ts`. `npx tsc -b --noEmit`
clean. `npm run smoke` 63/63, unchanged — no UI or gameplay behaviour
changed, so there was nothing new for the smoke test to cover.

`npm run probe` now runs two `it` blocks instead of one (54.8s total, up
from ~51.6s for the ruleset table alone; the room table adds ~3.2s for two
rooms × three agents × 20 seeds). The existing `ruleset comparison` table's
30 rows are confirmed unchanged: `hex-sprawl` still reads spread 4.3 / lift
1.12, matching this file's own recalibration table above, and `git diff
src/metrics.generated.ts` after the run is empty.

The new `room comparison` table, 20 seeds each, `CONFIG` defaults:

```
room            	threshold	greedy	careless	skill	2ply	lift	reached%	spread	minCells	clear%
Round Room      	50	1027	681	1.51	1094	1.07	100%	1.6	4	100%
Hourglass       	50	967	697	1.39	967	1.00	100%	1.3	1	100%
```

Both rooms clear 100% of the time for greedy, for the reason given in the
decisions log: a 50-point placeholder threshold is trivial for a
seven-figure greedy score, and a score-blind agent still stumbles onto an
exit inside a room this small almost every run. Not a pass or fail on the
room design — there is no goal-seeking agent yet to compare against (13c)
and no calibrated threshold yet to test against (22). Recorded so 13c has a
concrete "before" number: if a goal-seeking agent's clear rate comes back
at 100% too, the gap the item is designed to surface would read as zero,
which is itself informative.

**Item 13c.** `npm test` 335/335, unchanged — this item added no code under
`src/`, only `tools/probe.test.ts`, same as 13b. `npx tsc -b --noEmit`
clean. `npm run smoke` 63/63, unchanged — no UI or gameplay behaviour
changed. `git status --short` after the full run shows only
`tools/probe.test.ts` modified; `git diff src/metrics.generated.ts` is
empty, confirming the existing `ruleset comparison` table's rows and the
generated file it feeds are untouched by this item.

The weight sweep, 20 seeds per room per weight, `CONFIG` defaults:

```
room            	w	score	reached%	clear%
Round Room      	0	1016	100%	100%
Round Room      	1	1015	100%	100%
Round Room      	3	1015	100%	100%
Round Room      	10	1024	100%	100%
Round Room      	30	1014	100%	100%
Hourglass       	0	953	100%	100%
Hourglass       	1	953	100%	100%
Hourglass       	3	953	100%	100%
Hourglass       	10	953	100%	100%
Hourglass       	30	953	100%	100%
```

Every weight ties at 100% clear% on both rooms, confirming the ceiling
predicted in item 13b's own results log. `CHOSEN_W = 10` for the reasons in
the decisions log — not because the sweep favoured it, since the sweep
shows no weight is distinguishable from any other here.

The extended `room comparison` table, same 20 seeds as the `greedy` column,
`CHOSEN_W = 10`:

```
room            	threshold	greedy	careless	skill	2ply	lift	reached%	spread	minCells	clear%	goalClear%	gap
Round Room      	50	1027	681	1.51	1094	1.07	100%	1.6	4	100%	100%	0
Hourglass       	50	967	697	1.39	967	1.00	100%	1.3	1	100%	100%	0
```

**gap = 0 on both rooms.** Per the item's own text, this is a real, honest
finding, not an implementation gap: "a gap near zero means the exit
condition is not biting." The reach-and-score dual condition has not yet
been tested by anything measured in this project, because no room built so
far has had a score threshold hard enough for score to be the binding
constraint rather than the reach requirement — items 6 and 7 explicitly
left both rooms' thresholds at a round placeholder (50), pending item 22's
calibration pass. **13c is not the item that answers whether rooms work;
it is the item that proves the current two rooms are too easy to tell.**
That answer waits on item 22, once 13d's deeper search exists and real,
measured thresholds replace the placeholder.

No screenshots and no video — like 13b, this item changed a measurement
tool only. `git diff --stat` confirms `tools/probe.test.ts` is the only
file touched; there is nothing rendered to point a browser at.

No screenshots and no video — this item changed a measurement tool, not
anything rendered. `RoomRunPage`, `RoomBoardView` and every other UI file
are untouched (`git diff --stat` shows only `tools/probe.test.ts`), so
there is nothing new to point a browser at.

**Item 13d.** `npm test` 335/335, unchanged — same as 13b/13c, this item
added no code under `src/`, only `tools/probe.test.ts`. `npx tsc -b
--noEmit` clean. `npm run smoke` 63/63, unchanged — no UI or gameplay
behaviour changed. `git status --short` after the full run shows only
`tools/probe.test.ts` modified; `git diff --stat src/metrics.generated.ts`
is empty, confirming the existing table's persisted data is untouched by
this item, same as 13b/13c's own precedent.

`npm run probe`: 230s total (was ~55s at the end of item 13c), all three
`it` blocks passing, exit code 0. First run exited 1 on an unrelated vitest
worker-RPC heartbeat timeout, not `testTimeout` — see the decisions log for
the diagnosis and the one-line fix (a periodic `await` yield, not a
seed cut); the numbers below are byte-identical between the failing and
fixed runs, confirming the fix changed nothing about what was measured.

Full recalibrated probe output with the new `deep`/`deepLift` columns
(`DEEP_DEPTH = 4`, `DEEP_BEAM = 10`), 20 seeds each, beside the unchanged
`2ply`/`lift`:

| ruleset | target | greedy | careless | skill | 2ply | lift | deep | deepLift | reach% | spread | minCells | clear% |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| poker-baseline | 881 | 881 | 600 | 1.47 | 910 | 1.03 | 921 | 1.05 | 71% | 1.7 | 10 | 55% |
| poker-tight | 916 | 881 | 600 | 1.47 | 910 | 1.03 | 921 | 1.05 | 71% | 1.7 | 10 | 20% |
| poker-mult-amped | 881 | 881 | 600 | 1.47 | 910 | 1.03 | 921 | 1.05 | 71% | 1.7 | 10 | 55% |
| poker-partials | 915 | 915 | 612 | 1.50 | 989 | 1.08 | 1004 | 1.10 | 66% | 1.8 | 10 | 50% |
| poker-short-run | 545 | 545 | 366 | 1.49 | 557 | 1.02 | 563 | 1.03 | 81% | 1.7 | 10 | 50% |
| poker-partials-generous | 946 | 946 | 614 | 1.54 | 1021 | 1.08 | 1047 | 1.11 | 65% | 1.8 | 9 | 50% |
| poker-flat-ranks | 615 | 615 | 440 | 1.40 | 650 | 1.06 | 660 | 1.07 | 75% | 1.7 | 10 | 50% |
| poker-short-lines | 890 | 890 | 577 | 1.54 | 911 | 1.02 | 921 | 1.03 | 46% | 1.6 | 2 | 50% |
| poker-long-lines | 920 | 920 | 611 | 1.51 | 945 | 1.03 | 973 | 1.06 | 80% | 1.9 | 12 | 50% |
| poker-lean-hand | 830 | 830 | 619 | 1.34 | 855 | 1.03 | 865 | 1.04 | 72% | 1.7 | 10 | 50% |
| poker-small-board | 676 | 676 | 463 | 1.46 | 709 | 1.05 | 699 | 1.03 | 39% | 1.7 | 8 | 50% |
| draft-cribbage | 534 | 534 | 372 | 1.44 | 570 | 1.07 | 690 | 1.29 | 62% | 2.7 | 9 | 50% |
| draft-poker | 714 | 714 | 593 | 1.20 | 744 | 1.04 | 791 | 1.11 | 66% | 1.5 | 9 | 50% |
| draft-hex | 858 | 858 | 478 | 1.79 | 912 | 1.06 | 1034 | 1.21 | 59% | 2.6 | 13 | 50% |
| hex-sprawl | 1342 | 1342 | 480 | 2.80 | 1505 | 1.12 | 1558 | 1.16 | 55% | 4.3 | 13 | 50% |
| hex-sprawl-blank | 1146 | 1146 | 468 | 2.45 | 1256 | 1.10 | 1272 | 1.11 | 81% | 3.0 | 6 | 50% |
| hex-sprawl-flat | 1089 | 1089 | 390 | 2.79 | 1164 | 1.07 | 1191 | 1.09 | 62% | 4.4 | 13 | 50% |
| cribbage-blank | 687 | 687 | 309 | 2.22 | 723 | 1.05 | 777 | 1.13 | 86% | 3.5 | 5 | 50% |
| poker-blank | 841 | 841 | 556 | 1.51 | 862 | 1.02 | 870 | 1.03 | 75% | 1.7 | 5 | 50% |
| cribbage | 747 | 747 | 315 | 2.37 | 816 | 1.09 | 837 | 1.12 | 58% | 4.3 | 9 | 50% |
| cribbage-unbound | 1170 | 1170 | 327 | 3.58 | 1251 | 1.07 | 1275 | 1.09 | 36% | 6.0 | 13 | 55% |
| cribbage-pure | 528 | 528 | 120 | 4.40 | 612 | 1.16 | 630 | 1.19 | 49% | 36.0 | 10 | 55% |
| cribbage-lean | 690 | 690 | 312 | 2.21 | 726 | 1.05 | 759 | 1.10 | 61% | 4.0 | 10 | 50% |
| reference-poker-squares | 647 | 647 | 571 | 1.13 | 702 | 1.09 | 744 | 1.15 | 45% | 0.0 | 1 | 50% |
| mech-both-axes | 747 | 747 | 315 | 2.37 | 816 | 1.09 | 837 | 1.12 | 58% | 4.3 | 9 | 50% |
| mech-suit-axis | 747 | 747 | 315 | 2.37 | 816 | 1.09 | 837 | 1.12 | 58% | 4.3 | 9 | 50% |
| mech-deferred | 201 | 201 | 69 | 2.91 | 321 | 1.60 | 273 | 1.36 | 50% | 0.0 | 8 | 50% |
| mech-free | 747 | 747 | 141 | 5.30 | 816 | 1.09 | 837 | 1.12 | 58% | 8.0 | 31 | 50% |
| mech-lock-cash | 192 | 18 | 30 | 0.60 | 192 | 10.67 | 180 | 10.00 | -- | 9.0 | 0 | 0% |
| combo-cribbage-poker | 1571 | 1571 | 907 | 1.73 | 1619 | 1.03 | 1664 | 1.06 | 65% | 2.2 | 9 | 50% |
| cribbage-flush3 | 759 | 759 | 330 | 2.30 | 837 | 1.10 | 861 | 1.13 | 58% | 4.3 | 9 | 50% |

`hex-sprawl` — the ruleset item 22 will compare a room's own deep lift
against — reads deep lift **1.16** against 2-ply's **1.12**: a real,
non-zero gain from searching deeper, small but present, which is the honest
"before" number item 22 needs. Most rulesets move the same direction by a
similar margin (a few points of lift), with `draft-cribbage` (1.07 → 1.29)
and `draft-hex` (1.06 → 1.21) standing out as the two where deeper search
found noticeably more than 2-ply did. `mech-lock-cash` is the one
exception, and moved the *other* way (10.67 → 10.00) — flagged and
explained in the decisions log, not a bug.

The `room comparison` table gained the same two columns:

```
room            	threshold	greedy	careless	skill	2ply	lift	deep	deepLift	reached%	spread	minCells	clear%	goalClear%	gap
Round Room      	50	1027	681	1.51	1094	1.07	1094	1.07	100%	1.6	4	100%	100%	0
Hourglass       	50	967	697	1.39	967	1.00	1010	1.04	100%	1.3	1	100%	100%	0
```

Round Room's deep median matches its 2-ply median exactly (1094) — at a
17-19 cell room with only 12 placements, 2-ply's exhaustive top-12 already
finds what a width-10 beam finds too, so there's no headroom for "deeper"
to add anything here, consistent with item 13c's own ceiling finding for
these same two placeholder-threshold rooms. Hourglass shows a small real
gain (967 → 1010, lift 1.00 → 1.04). Neither number changes anything about
13c's own gap = 0 finding — this item only adds a comparison column, it
does not touch `clear%`/`goalClear%`/`gap` at all (`git diff` inside
`it('room comparison', ...)` shows only the two new column insertions and
the `d`/`dm` computation feeding them).

No screenshots and no video — like 13b/13c, this item changed a measurement
tool only; `git diff --stat` for the whole item shows exactly one file,
`tools/probe.test.ts`, so there is nothing rendered to point a browser at.

**Item 14.** `npm test` 342/342 (was 335 — 7 new: 3 in `item.test.ts` for
`itemLabel`/`applyItemEffects`, 4 in a new `inventory (item 14)` block in
`expedition.test.ts` covering `addItem`, the empty-inventory default, the
same-score proof, and cross-room persistence). `npx tsc -b --noEmit` clean.
`npm run smoke` 65/65 (was 63), the two new checks asserting `Items: none`
right after the Rooms page opens and again after the room transition to the
Hourglass.

Screenshot taken via a throwaway script against `tools/browser.mjs` (same
convention as prior UI items — run and discarded, not committed): the
Rooms page's header row now reads `Room 1 / 2 — Round Room · Running total
0 · Items: none`, confirming the inventory line renders in the real build,
not just in a test's DOM assertions. No video — this item added no
movement or feel, only a static label and an internal hook nothing yet
calls with a real effect.

No new numbers to report — this item is pure substrate. `applyItemEffects`
returning the identical `cfg` reference (not just an equal one) with zero
or more placeholder items is the whole of what item 15 needs verified
before it can safely assume "no items" and "some inert items" behave
identically; that guarantee is what the reference-equality assertions in
`item.test.ts` exist to lock down for whoever writes item 15 next.

**Item 15.** `npm test` 350/350 (was 342 — 8 new: 5 in `item.test.ts`
covering `applyItemEffects`'s new `secondCounter` arm — grants the lens,
is the identity transform when it matches the primary, a no-op item
doesn't clear an earlier grant, mixes harmlessly with placeholder items —
plus `itemLabel`'s naming; 3 in `expedition.test.ts`'s new "second counter
item (item 15)" block, driven through `placeInRoom` rather than
`applyItemEffects` directly — strictly higher score with the item carried
on an identical card/cell/seed, no effect once the granted lens is already
the room's primary counter, and the boost still applies after a room
transition). `npx tsc -b --noEmit` clean. `npm run smoke` 70/70 (was 65 —
5 new: the dev pickup control is enabled, the inventory line updates to
"Items: Cribbage (2nd counter)" and the control disables once carried, the
carried counter boosts the next placement to the exact offline-computed
score, and that boosted placement alone clears the room).

The exact numbers (seed `rooms-1`, default `CONFIG`, worked out with a
`vite-node` throwaway script against `expedition.ts` directly — run and
discarded, not committed, same convention as items 7-13 but a different
runner since there's no compiled-JS entry point to script against
otherwise): replaying the established seven-move Round Room sequence
(`(2,0)` → `(1,0)` → `(0,0)` → `(0,-1)` → `(-1,-1)` → `(-1,0)` → `(0,1)`)
reproduces item 13's own final score, **407**, byte-for-byte — confirming
this item touched nothing upstream of itself. Entering the Hourglass with
that same hand (`AS, KD, 6H, QH, 9H, 6D, artifact-AS`, matching item 7's
own log), the ace of spades landing on the room's north exit `(0,-4)`
scores **46** under poker alone (`reached: true, score: 46, scoreMet:
false, cleared: false` — short of the 50 threshold) and **59** once a
`secondCounter` item granting cribbage is carried (`reached: true, score:
59, scoreMet: true, cleared: true`). Same card, same cell, same seed —
the only variable is the item, and it is the entire difference between a
near-miss and a clear on that one move, not just a bigger number on an
already-cleared room the way items 9/10's boosts landed in an
already-cleared Round Room.

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, fresh port per
item 7/8's stale-port note, run and discarded, not committed), racing
through the established seven-move Round Room sequence and into the fresh
Hourglass:

| screenshot | shows |
|---|---|
| fresh Hourglass | `Items: none`, the dev pickup button enabled, "Not reached" / "Score 0 / 50 (short)" / "Not cleared" |
| after clicking the pickup button | `Items: Cribbage (2nd counter)`, the button now disabled, room state unchanged (nothing has been placed yet) |
| after placing A♠ on the north exit | "Reached" / "Score 59 / 50 (met)" / "Cleared", "Leave through exit" lit emerald, and the log line "Last placement: A♠ at 0,-4 scored 59" — matching the offline calculation exactly, not the 46 a bare poker placement would have scored on the identical move |

No video — this item is a scoring effect and an inventory-line update, not
movement or feel.

**Item 16.** `npm test` 365/365 (was 350 — 15 new: 6 in `item.test.ts` for
`itemLabel`/`applyItemEffects`'s identity arm on `'sight'` and `hasSightItem`
across empty/other-only/mixed inventories; 4 in `room.test.ts` for `roomTraps`
— finds a hand-authored trap, returns empty for a trapless room, matches
`ROUND_ROOM`'s own single trap cell, and is sprung-state-ignorant like
`trapCellsNear`; 5 in a new `visibleTraps / sight item (item 16)` block in
`expedition.test.ts` — without sight shows only `revealedTraps` itself (`toBe`,
same reference), with sight reveals an unsprung trap, a sight-revealed trap
still costs a card the first time it's actually triggered, a genuinely sprung
trap stays visible without sight carried, and a trapless room reveals nothing
even with sight). `npx tsc -b --noEmit` clean. `npm run smoke` 75/75 (was 70 —
5 new: a fresh expedition's Round Room starts with its trap hidden exactly
like the very first pass through it did, the sight pickup control is enabled
and then disables once carried, the inventory line reads "Sight (reveals
traps)", the trap tile becomes visible with zero placements made, and the
placement budget reads unchanged — "placements left 12" — proving the reveal
cost nothing).

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, run and discarded,
not committed): opened Rooms, screenshotted the fresh Round Room (trap at
`(-2,1)` indistinguishable from a plain border cell — no badge, no rose tint),
clicked "Dev: pick up sight", and screenshotted again — the same cell now
shows the rose "trap" tint and skull badge, the header reads `Items: Sight
(reveals traps)`, the pickup button is disabled, and every other readout
(`Score 0 / 50`, `placements left 12`) is byte-identical to the first
screenshot. A tight crop on just that cell makes the badge legible at full
resolution. No video — this item is a static reveal, not movement or feel.

**Item 17.** `npm test` 382/382 (was 365 — 17 new: 10 in `item.test.ts` for
`itemLabel`, `applyItemEffects`'s identity arm on `'reachAnchor'` (alone and
mixed with other kinds), `hasReachAnchorItem` across empty/other-only/mixed
inventories, and `consumeReachAnchorItem` removing exactly one charge,
leaving a second untouched, being a safe no-op with none carried, and not
mutating its input; 7 in a new `reach anchor item (item 17)` block in
`expedition.test.ts` — rejects an unconnected cell with no charge carried,
accepts it once one is, `placeInRoom` spends the charge only on the
placement that actually needed it, does not spend a carried charge on a
placement that was already legal on its own, a placement dropped via the
charge becomes a real second origin a later placement can grow from with no
further charge spent, the empty-board opening placement never touches a
carried charge, and `placeInRoom` stays a no-op on an unconnected cell with
nothing carried). `npx tsc -b --noEmit`
clean. `npm run smoke` 90/90 (was 77 — 13 new, in the same fresh Round Room
item 16's own sight check left in place: the opening placement's budget
reads correctly (11 left), clicking the unconnected cell with nothing
carried is rejected and spends no placement, the reach-anchor pickup is
available and the inventory line shows it alongside the still-carried sight
item once clicked, the pickup control disables once carried, the
previously-illegal cell holds a real card once the charge is spent (budget
10), the inventory line drops back to just sight, the pickup control
re-enables the instant the one charge it granted is gone, and a follow-up
placement adjacent only to the new island — not the origin — succeeds
(budget 9) with the inventory still reading just sight, unchanged, because
nothing was spent on an already-legal placement).

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, run and
discarded, not committed), in a fresh Round Room (`New expedition`, no items
carried this time — item 16's own sight is orthogonal to this one and
wasn't picked up in this run):

| screenshot | shows |
|---|---|
| after placing the opening card at the origin `(0,0)` | one card on the board, `Items: none`, `placements left 11` |
| clicking `(2,-1)` (hex-distance 2 from the origin — not a neighbour) with no reach anchor carried | the cell stays empty — no card rendered — and `placements left 11` is unchanged: the click was rejected outright, not merely scored as zero |
| after clicking "Dev: pick up reach anchor" | header reads `Items: Reach anchor (place one card unconnected)`, the pickup button disables |
| after placing on `(2,-1)` with the charge carried | a real card now sits at `(2,-1)`, visibly disconnected from the origin card with empty hexes between them, `placements left 10`, header drops back to `Items: none`, and the pickup button re-enables |
| after placing on `(2,-2)` (a real neighbour of `(2,-1)`, not of the origin) with no charge left | a third card renders there, `placements left 9`, `Items: none` still — nothing was spent because this placement was already legal via the new island |

The last screenshot incidentally shows `reached: false` even with two
occupied cells sitting one hex-step from an exit — neither `(2,-1)` nor
`(2,-2)` *is* the exit `(2,0)`, and item 5's "touch" means occupying the
exit cell itself, not merely standing beside it. Not something this item
changed or needed to demonstrate, but worth noting as confirmation that nothing
about the reach-anchor bypass leaks into the reach condition itself — an
unconnected structure is exactly as unreached as a connected one until it
actually lands on a door. No video — this is a legality and inventory
effect, not movement or feel in the drag/animation sense; the disconnection
itself is best shown as a static before/after, which the screenshots above
already do.

**Item 18.** `npm test` 392/392 (was 382 — 10 new: 5 in `item.test.ts` for
`itemDuration` (defaults to `'expedition'` for every existing kind, reads
back an explicit `'room'`, reads back an explicit `'expedition'` the same
as the default) and `itemLabel`'s new duration tag (no tag for the default
across all four kinds, `"(this room only)"` appended generically for any
kind carrying `duration: 'room'`); 5 in a new `temporary vs permanent items
(item 18)` block in `expedition.test.ts` — a room-duration item stays
carried and usable up to the moment its room ends, `leaveRoom` drops a
room-duration item but keeps an expedition-duration one in the very same
transition, an item with no `duration` field survives exactly like an
explicit `'expedition'` one (the item 14 case, re-proven under the new
field), a room-duration item is also dropped on the transition that
completes the expedition (not just an ordinary room-to-room one), and
`leaveRoom` does not mutate the pre-leave state's item array). `npx tsc -b
--noEmit` clean. `npm run smoke` 92/92 (was 90 — 2 new: the temporary-marker
pickup control and the inventory line reading exactly `Items: Temporary
marker (this room only)` before the existing Round-Room-1 leave; the
already-existing post-leave `Items: none` check needed no new assertion to
prove the drop — reworded its description since, for the first time, it now
proves something was actually stripped rather than that nothing was ever
carried).

Drove `RoomRunPage` in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, run and
discarded, not committed), replaying the item 7-13 placement sequence in a
fresh Round Room to reach the clearable state, then:

| screenshot | shows |
|---|---|
| header after picking up the temporary marker, room still Round Room 1/2 | `Items: Temporary marker (this room only)`, the pickup button itself now disabled |
| header after leaving through the exit | `Room 2 / 2 — Hourglass`, `Items: none`, the temporary-marker pickup button re-enabled — the item is gone, not just hidden |

The two screenshots side by side are the whole point of this item, the same
way item 6's near-miss-versus-clear pair was: a room-scoped item reads
distinctly while carried and is verifiably gone the instant its room ends,
not a cosmetic label sitting on top of unchanged persistence. No video —
this is an inventory-lifecycle effect, not movement or feel.

**Item 16.** The backlog item's own text offers an "or" — see the next
room's shape, or reveal this room's hidden tiles — and gives no reason to
prefer one. Picked the trap-reveal reading: it reuses a real substrate
(item 12's hidden/revealed trap state) rather than needing a first look at
"what does a room preview even show" with no second room shape ever visible
mid-run today (the sequence is fixed, item 21's room graph is what would
make "the next room" a real, examinable thing rather than an implementation
detail nobody's built UI for yet). Traps are also the *only* tile kind with
hidden state — item 8/11/13's own decisions logs are explicit that a
marker, a multiplier, a blocked cell and an artifact are all visible from
the moment the room loads — so "reveal this room's hidden tiles" has
exactly one kind of tile to mean in this codebase today.

The one real design question was where the effect lives. `applyItemEffects`
(item 14's hook) exists to produce the `Config` a room's legality and
scoring run under — the natural home for `'secondCounter'` (item 15), which
genuinely changes a rule. Sight changes neither: whether a trap has
*sprung* — the only fact `placeInRoom`'s cost logic reads — is completely
unaffected by whether a player has *seen* it. Routing `'sight'` through
`applyItemEffects` anyway (returning `acc` unchanged, the same identity arm
`'placeholder'` already uses) would have been technically harmless but
conceptually wrong — it would imply sight is a rules effect that just
happens to be a no-op, rather than a different *kind* of item altogether.
So the real effect lives in a new, separate function, `expedition.ts`'s
`visibleTraps(state)`: a pure union of `state.revealedTraps` (traps that
have actually sprung — untouched, still the only thing `placeInRoom` reads)
with every trap in the current room (`room.ts`'s new `roomTraps`, "all of
them," a broader query than item 12's own `trapCellsNear`, "on or beside
one cell") when the inventory carries a sight item
(`item.ts`'s new `hasSightItem`). `RoomRunPage` passes this, not
`state.revealedTraps` directly, into `RoomBoardView`'s existing
`revealedTraps` prop — that prop already meant "which trap cells to render
as shown," and a sight-widened superset of the real reveal set satisfies
that contract exactly, so no new prop or rendering code was needed at all,
only a different value flowing into the one that already existed.

Tested the boundary explicitly, not just the reveal itself:
`expedition.test.ts`'s new suite proves a sight-revealed-but-unsprung trap
still costs a card the first time a placement actually lands on or beside
it (`cardsLost` still length 1, the card pool still shrinks by exactly one)
— sight only ever changes what renders, never what `placeInRoom` does. Also
covered the reverse direction most other item tests don't need to state
explicitly: once a trap has genuinely sprung, it stays visible in
`visibleTraps` even *without* sight carried — the union is additive, never
gating the real reveal behind carrying the item.

No new pickup mechanic beyond the same kind of dev stand-in item 15 used,
for the identical reason logged there: nothing from 15 through 18 specifies
an in-room acquisition path. "Dev: pick up sight" sits beside "Dev: pick up
cribbage counter" in `RoomRunPage`'s header row, calling `addItem` with
`{ kind: 'sight' }` directly and self-disabling once carried, same shape.

Demonstrating the effect needed a fresh room rather than reusing the
established smoke sequence: by the time that sequence reaches item 15's own
segment, the Round Room's one trap (`(-2,1)`) has already sprung (move 6,
item 12's own log), so picking up sight there would just be looking at an
already-revealed tile — no proof sight did anything. `RoomRunPage`'s "New
expedition" button (present since item 7, previously only exercised by
hand, never by an automated test) resets to a brand-new Round Room with an
empty inventory — the first automated use of that control anywhere in the
test suite — giving a clean "hidden by default" baseline to contrast
against "visible once sight is picked up," both checked with no placement
having happened at all, so the score/budget readouts prove the reveal
carries no side cost.

`applyItemEffects(CONFIG, [{ kind: 'sight' }])` returns `CONFIG` itself
(`toBe`, not `toEqual`) — the same reference-equality guarantee item
14/15's own tests lock down for `'placeholder'`/inert `'secondCounter'`
cases, extended to cover that a `'sight'` item mixed into any inventory
never perturbs a `'secondCounter'` item's real effect sitting alongside it.

**Not done this item, on purpose.** No "see the next room's shape" reading
— set aside above, and left for whichever later item (most plausibly one
alongside item 21's room graph, where "the next room" becomes a real,
choosable thing rather than a fixed sequence) wants to build it, rather
than bolted on here as a second, thinner effect just because the backlog
text allowed it.

**Item 17.** The backlog item's own "or" — place one card unconnected, or
extend from a second origin — turned out not to be a real choice between two
mechanics, unlike item 16's actual either/or. `hasHexNeighbor` (`hex/board.ts`)
tests adjacency against *any* occupied cell on the whole board, not against
one connected structure, so a single unconnected placement already *is* a
second origin the moment it lands — every ordinary placement after it can
grow from either island with no further help, since adjacency has never
cared which island a neighbour belongs to. `room.ts`'s own header comment had
already flagged this in item 5's own words ("a structure need not be one
contiguous blob (free placement, item 17's alternate origins)") and
`structureReachesExit` already walks connected components rather than
assuming one blob — reach was ready for a second island before this item
existed; nothing about it needed to change.

So `{ kind: 'reachAnchor' }` (`item.ts`) is one thing, not two: a charge that
lets exactly one placement skip the adjacency check. `applyItemEffects`
routes it the same way item 16's `'sight'` is routed — the identity
transform, since (like sight) it changes what a placement is legal *despite*,
not a `Config` field any scorer or legality check downstream of
`applyItemEffects` reads. The real effect is a new shared predicate in
`expedition.ts`, `failsAdjacency(state, h, effectiveCfg)`, factored out of
what `isLegalRoomPlacement`'s adjacency branch used to compute inline:
`isLegalRoomPlacement` now falls back to `hasReachAnchorItem(state.items)`
when a cell fails that check instead of rejecting it outright, and
`placeInRoom` recomputes the *identical* condition (same function, same
inputs) after confirming the move is legal, to decide whether this specific
placement actually needed the charge. Factoring this into one function
rather than writing the condition twice was a deliberate choice, not just
tidiness — `isLegalRoomPlacement` approving a placement and `placeInRoom`
deciding whether to spend a charge on it are two different questions that
must agree on the same fact (did this cell fail plain adjacency?), and two
independently-written copies of "board non-empty and no neighbour" drifting
apart under a future edit is exactly the kind of silent scoring/legality bug
ROOMS.md's standing rules exist to prevent.

The consumption rule needed one more piece of care: *only* spend the charge
when the placement actually relied on it. A placement that's already legal —
the opening move on an empty board (the empty-board branch of
`failsAdjacency` short-circuits before the neighbour check even runs), or an
ordinary placement adjacent to existing structure — must not eat into a
carried charge just because one happens to be sitting in inventory; nothing
in the item's own text ("place one card unconnected") suggests it should
apply to a card that wasn't unconnected. `item.test.ts` and
`expedition.test.ts` both lock this down directly rather than trusting the
`failsAdjacency` guard to make the point on its own.

`consumeReachAnchorItem` (`item.ts`) removes exactly one `'reachAnchor'`
instance — the first found, arbitrary since every instance is identical and
fungible, same as `payTrapCost`'s "top of the deck" not being a meaningful
choice among identical cards — leaving any others (and every other item
kind) untouched. Mirrors `addItem`'s pure-append shape in reverse rather than
inventing a different pattern.

The dev-pickup button (`RoomRunPage.tsx`) needed one behavioural difference
from items 15/16's: `sight`/`secondCounter` are standing effects, so their
buttons disable forever once carried (there is only ever "carrying" or "not
carrying", no in-between). A spendable charge has three states over a run —
none, one, spent-back-to-none — and the button's `disabled` condition
(`state.items.some(it => it.kind === 'reachAnchor')`) reads live off current
inventory rather than a separate "ever picked up" flag, so it *automatically*
re-enables the instant a placement consumes the one charge it granted,
letting a player go pick up another. No new state needed for this — it fell
straight out of reusing the same `carryingX` pattern items 15/16 already
established, which turned out to already have exactly the right shape for a
consumable once the underlying inventory is the thing being read.

Demonstrated in a fresh Round Room (via "New expedition", same room used for
item 16's own demo) with cells worked out on paper against `hex/coords.ts`'s
own distance formula, not guessed: `(2,-1)` is hex-distance 2 from the
origin `(0,0)` — not a neighbour of it — so once a card sits at the origin,
`(2,-1)` is a genuinely unconnected cell; `(2,-2)` is hex-distance 2 from the
origin (also not a neighbour) but *is* a real hex-neighbour of `(2,-1)`,
making it a clean "grows from the new island, not the old one" witness. This
is a legality/inventory effect, not a scoring one, so — unlike items 9/10's
own tile-bonus demos — there was no offline score arithmetic to work out
first; the fact under test the whole way through is which cells are
placeable, proven directly by whether a `.card-face` renders and by the
inventory line's exact text before and after. Verified live in the browser
(see results log), then locked the identical scenario into the smoke test
(`tools/smoke.mjs`), extending the same fresh-Round-Room session item 16's
own sight check left in place, right before "Back to the board" — reusing an
existing empty-board session rather than resetting again, since nothing
about this item needs a clean inventory, only an empty board.

**Item 18.** The first real question was whether "temporary" belongs to an
item's *kind* or to the individual carried *instance*. Every item shipped
through item 17 (`secondCounter`, `sight`, `reachAnchor`) already, in
practice, lasts the whole expedition — nothing strips any of them at a room
boundary — and item 14's own test explicitly pins that as tested behaviour
("survives a room transition — ... inventory is not per-room"). A per-kind
answer (e.g. "`placeholder` is always room-scoped") would have silently
broken that test the moment it applied to the `TEST_ITEM` placeholder it
uses, which is a real signal that duration is a property of the *instance*
carried, not something implied by `kind` alone — two placeholders with
different flavour text could plausibly want different durations even today.
So `Item` gained an **optional** `duration?: 'room' | 'expedition'` field on
every variant (`item.ts`) rather than a required one or a lookup table keyed
by kind, and a new `itemDuration(item)` reads it back defaulting to
`'expedition'` — every item literal in this codebase (and every existing
test) compiles and behaves exactly as before, since none of them ever set
it. This is also the reason the field is optional rather than mandatory: a
mandatory field would have forced every one of the ~25 existing `Item`
literals across `RoomRunPage.tsx` and the test files to specify
`duration: 'expedition'` for no behavioural gain, pure churn against files
items 14-17 already finished.

The second question was what should actually demonstrate a `'room'`
duration existing, since nothing shipped before this item needs one. Considered
inventing a fifth item kind with a real rule or score effect, but rejected
it — item 18's own text is about the temporary/permanent *distinction being
visible*, not a new bonus, and section D's later items (19+) are where new
real effects belong per the standing "don't do a later item's design work
early" reasoning items 8 and 14 both used for their own substrate-only
kinds. Reused `'placeholder'` instead — already the "prove the plumbing, no
real effect" kind since item 14 — giving it `duration: 'room'` for the
`RoomRunPage.tsx` dev-pickup demo (`{ kind: 'placeholder', label:
'Temporary marker', duration: 'room' }`) rather than adding new machinery
just to have something to point the mechanism at.

The actual enforcement is one line in `expedition.ts`'s `leaveRoom`:
`state.items.filter((item) => itemDuration(item) !== 'room')`, applied on
both the ordinary room-to-room transition and the transition that completes
the expedition (the item's own text doesn't distinguish the two, and there
is no reason a room-scoped item should outlive the *last* room any less than
an earlier one — covered directly in `expedition.test.ts` rather than left
to be assumed). Placed alongside the existing `board`/`revealedTraps`/
`collectedArtifacts` resets `leaveRoom` already does for other per-room
facts, so a room-scoped item's lifetime now reads as one more thing that
resets there rather than a special case bolted on separately.

Made the visibility change generic rather than tied to the one demo item:
`itemLabel` (`item.ts`) now appends a literal `"(this room only)"` suffix
whenever `itemDuration(item)` is `'room'`, for *any* kind, computed as a
final step after the existing kind-specific switch rather than a parallel
function — so a future room-scoped `secondCounter` or `sight` (nothing
stops one) would get the same tag with zero UI changes anywhere, the same
way item 9's marginal-contribution formula was written once against `Lens`
and works for every counter without special-casing. Deliberately tags only
the room-scoped case and leaves the permanent case unmarked (no
`"(permanent)"` suffix) rather than labelling both symmetrically — every
existing exact-string smoke and unit-test assertion on a permanent item's
label (`'Cribbage (2nd counter)'`, `'Sight (reveals traps)'`, etc., items
15-17's own locked-down text) stays correct unchanged, and the *exception*
being the one that's marked reads naturally: permanent is the default
you've had all along, temporary is the thing new enough to flag.

No new `Config` field, no change to `applyItemEffects` — duration is purely
a lifecycle question `leaveRoom` answers, orthogonal to what an item's
effect on legality/scoring is (or isn't), so item 15's `secondCounter` arm,
16's `sight` arm and 17's `reachAnchor` arm in `applyItemEffects` needed
zero changes.

**Item 19.** The backlog item names three axes — active counters, tile
density, threshold — and two of those three already existed as ordinary
room properties (`threshold` since item 6; tile *count*, if not a named
"density", since item 8's `TileMap`). The one genuinely new piece of
machinery is active counters as a room property, since every counter
decision before this item lived on `Config` (`lensId`/`secondLensId`,
global to a run) or on a carried item (item 15's `secondCounter`, which
only ever *adds* a second counter on top of whatever `Config` already
says) — nothing let a room *replace* the run's own counters outright.
`Room` gained a fifth, optional field, `counters?: { lensId: string;
secondLensId: string }` (`room.ts`), and a new pure function, `roomConfig(
room, cfg)`, returning `cfg` unchanged (same reference, `toBe`-tested) when
the room sets nothing, or `cfg` with `lensId`/`secondLensId` overwritten by
the room's own when it does. `makeRoom` validates a given `counters` at
construction time exactly like it already validates exits and tile
placement — `getLens` throws on an unknown id, so a typo in an archetype's
counters fails loudly when the room is defined, not silently at the first
placement scored inside it.

The one real design question was *order*: does a room's own counters apply
before or after a carried item's effect? `expedition.ts`'s `placeInRoom`
now computes `effectiveCfg` as `applyItemEffects(roomConfig(room, cfg),
state.items)` — room counters first, item effects second — so item 15's
`secondCounter` still *adds* on top of whatever baseline the room sets,
the same "layers on, never overridden" behaviour it already had against a
run's own `Config`. Tested directly: a room fixed to cribbage-only still
scores strictly more once a carried poker second-counter item is added,
exactly mirroring the existing run-level test for the same item. Legality
(`isLegalRoomPlacement`'s adjacency check) was deliberately left reading
the plain `cfg` it always has — a room's counters only ever touch
`lensId`/`secondLensId`, never `mechanics.requireAdjacency`, so routing it
through `roomConfig` too would be a no-op dressed up as consistency.

Tile density needed no new state, only a name and a formula: `tileDensity
(room) = room.tiles.size / room.cells.size`, a fraction in `[0, 1]`, purely
descriptive — nothing reads it for legality or scoring, matching the
backlog item's own framing of density as an axis a room *differs along*,
not a rule. Surfaced in `RoomRunPage`'s existing info line (which already
printed cell/exit/threshold/budget counts) as `NN% tiled`, and the active
counters as a plain joined name list (`activeLensIds` + `getLens(id).name`,
item 2's own machinery, not a second way of asking the question) — both
now visible for any room, not just the two new ones.

Two new hand-authored rooms in `shapes.ts`, `CRIBBAGE_VAULT_ROOM` and
`COMBO_BAZAAR_ROOM`, exist to make the three axes a genuine demonstration
rather than an unexercised code path: the vault is the smallest room shape
in the game (`hexesWithinRadius(1)`, 7 cells) with cribbage-only counters
and one sparse tile (14% density); the bazaar reuses the Round Room's own
19-cell disc but with combo cribbage+poker counters and nine tiles (47%
density) — deliberately the opposite end of the density axis from the
vault, and denser than the Round Room's own 32% (6/19). Neither threshold
(30, 80) is calibrated — the same round-placeholder status every room's
threshold has carried since item 6, per the standing "never tune a room by
eye" rule; item 22 is where all of them become real numbers together.

Deliberately did **not** append either archetype to `ROOM_SHAPES` — that
array is the fixed sequence both `RoomRunPage`'s default run and the
smoke test's whole established sequence (item 7 through item 18's checks)
already drive move-by-move, and lengthening it would mean re-deriving
every downstream "Room 1 / 2" / "Room 2 / 2" text assertion for no gain
this item asks for (item 21's room graph is where "which room comes next"
becomes a real, chosen question — not this one). Instead, `shapes.ts`
exports both individually and as `ARCHETYPE_ROOMS`, and `RoomRunPage`
gained one more dev-only stand-in control, "Dev: load archetype rooms" —
the same pattern items 15-18 used for a mechanic with no in-run
acquisition/trigger path yet, here standing in for item 21's not-yet-built
room choice. Clicking it starts a fresh expedition through
`[CRIBBAGE_VAULT_ROOM, COMBO_BAZAAR_ROOM]` instead of the default rooms.

Extended `tools/smoke.mjs` with a new segment after the existing reach-
anchor sequence: click the new control, confirm the vault renders its 7
cells with `14% tiled` and `Cribbage` shown (not the run's own poker), then
place hand[0] at the origin and confirm it scores exactly 9 — cribbage's
flat "3 points/card, no count" on a lone low card across all three lines,
a deterministic figure verified offline the same way the original Round
Room sequence was (a throwaway script against `expedition.ts`, run and
discarded, not committed) — only reachable if the room's own counters
actually won over `CONFIG.lensId`'s `'poker'`. `npm test` 411/411 (was
392 — 13 new in `room.test.ts`: 5 covering `makeRoom`'s counters
validation, including two that throw on an unknown lens id;
4 for `roomConfig` including reference-equality when a room sets nothing
and untouched-`mechanics` when it does; 4 for `tileDensity` including the
two real archetypes' relative ordering; 6 new in `expedition.test.ts`
covering `placeInRoom` end-to-end — a room's counters overriding the run
cfg, a no-op passthrough when unset, combo-beats-single scoring through a
real room object, a carried second-counter item still layering on top of
a room's own baseline, and both new archetype rooms scoring correctly
through the real `shapes.ts` exports rather than only through synthetic
test rooms). `npx tsc -b --noEmit` clean. `npm run smoke` 97/97 (was 92 —
5 new: the archetype run opens in the Cribbage Vault, the vault renders
its 7 cells, the panel reports `Cribbage` rather than the run's own poker,
the panel reports `14% tiled`, and the opening placement scores exactly 9
under the vault's own counter).

Drove it live in headless Chromium via `tools/browser.mjs` (throwaway
script, same server-then-screenshot pattern as `smoke.mjs`, run and
discarded, not committed): loaded the archetype rooms, placed three cards
in the Cribbage Vault (screenshots `archetype-1-cribbage-vault.png` before
any placement — 7 cells, `14% tiled · Cribbage` — and
`archetype-2-cribbage-vault-placed.png` after two, showing `Reached` and
"you got there but were short" at score 22/30), then a third placement
crossed the threshold (score 35/30) and leaving carried the running total
into `archetype-3-combo-bazaar.png` — `Room 2 / 2 — Combo Bazaar`,
`19 cells · 2 exits · threshold 80 · placements left 12 · 47% tiled ·
Cribbage + Poker`, `Running total 35`, and the board visibly denser with
`×2`/`L×2` badges than the vault's single tile. The three screenshots
together are the whole point of this item: two rooms, back to back in one
run, differing visibly along every axis the backlog item named, with the
running total proving the expedition — not just the room — survives the
switch. No video: this item is about room *identity*, not movement or
feel.
