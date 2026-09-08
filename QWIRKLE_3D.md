# Qwirkle 3D — product requirements

A Qwirkle clone played in a cubic lattice. Same 108-piece set, same line rule,
same "place, join lines, score their lengths" spine — but the pieces are cubes
in a 3D space and a placement joins up to **three** lines instead of two.

This is a mechanics test, not a game, on the same standard as the grid-card
prototype. It exists to answer two questions:

1. Does a third axis make a placement **richer**, or does it just make every
   placement **score more**?
2. Can a 3D board be read fast enough to plan in?

Question 2 is the one that kills the project if it goes badly, and it is a
rendering and interaction question, not a rules question. It gets equal weight
in the build order for that reason.

## Why Qwirkle, and why now

`FINDINGS.md` has one load-bearing result: **additive, partial-credit scoring is
what makes a placement decision live; an all-or-nothing hand table kills it.**
Poker sat at a lookahead lift of ×1.09, and ten config changes moved it only
between ×1.06 and ×1.19, because there was nothing to build toward. Cribbage ran
×1.18–×1.43 because every card added to a line changed its value by a readable
amount.

Qwirkle is the purest additive line-scorer there is. A line is worth its length,
full stop; every cube you add to it is worth exactly one more point next time
anyone touches it, and completing it at six is worth double. There is no
category table, no threshold, no cliff. If the finding is real, Qwirkle should
measure well before a single tuning pass — and if it doesn't, the finding was
narrower than we wrote it down as. Either result is worth having.

The 3D twist is aimed at the *other* recorded flaw. Hex sprawl separated skill
well but had a choice spread of 15.5 pre-additive (4.3 recalibrated): most cells
are near-dead and a few are enormous, so you farm one rich pocket. A third axis
attacks that directly — a cell's value is the sum of three independent line
contexts, so "rich pocket" stops being a place and starts being an intersection.
Whether that flattens the spread or explodes it is the measurement.

## The rules

### The set

6 colours × 6 shapes × 3 copies = **108 cubes**. Unchanged from Qwirkle, and
deliberately so: the twist is spatial, and adding a third attribute would change
two things at once.

**Every face of a cube shows the same shape in the same colour.** Orientation is
not game state. This is a rule, not a rendering note — it is what lets a cube be
identified from any camera angle and what keeps a cube one thing rather than six.
Per-face symbols are listed under Deliberately absent, with reasons.

### The space

An integer lattice, `(x, y, z)`, held sparse:

```ts
export type CubeBoard = ReadonlyMap<string, Cube>;   // key: "x,y,z"
```

Mirroring `HexBoard`'s `ReadonlyMap<"q,r", Card>` exactly, for the same reason:
the occupied set is small relative to the space it sits in, and a sparse map
makes "what is next to this" a lookup rather than a scan.

**Adjacency is face adjacency** — the 6-neighbourhood. Cubes touching along an
edge or at a corner are not adjacent, form no line, and constrain nothing. This
is the only definition consistent with lines running along axes, and it is what
makes a diagonal staircase of cubes legal but worth zero, which is a real and
interesting move.

### Lines

Three axes: X, Y, Z. A placement's lines are the maximal contiguous runs of
occupied cells through it on each axis. A line of length 1 is not a line.

A line is **valid** when either:

- every cube in it shares one colour, and their shapes are pairwise distinct; or
- every cube in it shares one shape, and their colours are pairwise distinct.

There is no explicit length cap and there does not need to be one: six distinct
shapes and six distinct colours means a valid line cannot exceed 6. The cap
falls out of the rule instead of sitting beside it.

### Legality

A cube may be placed in an empty cell when:

- it is face-adjacent to at least one placed cube (the first cube of the game
  goes at the origin), **and**
- all three lines through that cell are valid after the placement.

All three, always. A placement that builds a beautiful X line and breaks the Z
line it happens to sit in is not a legal placement — that constraint is the game.

### A turn

Place **one or more** cubes, then refill to a hand of 6 from the bag. Every cube
placed in one turn must lie on a **single axis line**, contiguous with each other
and with whatever was already there. Or: exchange any number of cubes back into
the bag, forfeiting the turn.

Multi-cube turns are not optional flavour. They are where the Qwirkle-completing
plays live, and dropping them would leave a game where the ceiling on one turn is
36 points and nobody can ever reach it.

### Scoring

Every distinct line of length ≥ 2 containing at least one newly placed cube
scores **its length**. A line completed at 6 scores 6 + 6 = **12** — a
**Qwirkle**.

For a single cube that is up to three lines. For k collinear cubes, the shared
line scores once and each cube's two cross-axis lines score individually. A line
is never counted twice in one turn.

The ceiling on a single cube is three simultaneous Qwirkles: 36 points. Call it a
**Keystone**. It is the whole reason to build in three dimensions and it should
happen approximately never — if the probe reports Keystones in more than ~1% of
placements, the scoring is too loose and the volume is too generous.

### Ending

Bag empty and a player empties their hand: +6, game over. Or no legal placement
exists anywhere for anyone. Solo runs additionally end on the placement budget,
matching `engine.ts`'s existing `settle`.

## Pre-declared decisions

Taken so the build does not stall on a question. Any of these can be overridden,
and the ones marked ▣ are wired as config so the probe can argue with them.

| Question | Default |
|---|---|
| Piece attributes | ▣ 6 colours × 6 shapes × 3 copies. **No third attribute.** |
| Cube faces | Identical on all six. Orientation is not state. |
| Adjacency | Face only (6-neighbourhood). Edges and corners touch but do not connect. |
| Build volume | ▣ **Bounded, 8×8×8.** Not unbounded, not 6×6×6 — see below. |
| Gravity / support | ▣ **Off.** Cubes float; connection is by adjacency alone. |
| Lines per placement | Up to 3, all of which must validate. |
| Multi-cube turns | Yes, collinear on one axis. |
| Line length cap | None stated; 6 falls out of distinctness. |
| Opponent | Solo score-attack first, hot-seat 2P second, AI third — and the AI *is* the probe's agents. |
| Camera | ▣ Snapped orthographic orbit. **No free camera.** |
| Renderer | Hand-written canvas painter's-algorithm projection. Three.js only if picking forces it. |
| Touch | In scope from day one, not bolted on. |
| Persistence | None. Seed box + New run, as everywhere else in this repo. |

### Why 8×8×8 and not unbounded

The hex board is deliberately sprawling — "the point of a sprawl is that it has
no fixed extent" — and that was right for hexes on a plane, where the camera can
just zoom out. In 3D a sprawl is unreadable: the interior is invisible, the
framing changes every turn, and the probe's move space grows without bound.

But a tight 6×6×6 is worse than it looks. Six is the line cap, so a 6-wide axis
means every completed line occupies the entire axis and there is exactly one
place it can go. *Where along the axis* stops being a decision. At 8 there are
three offsets for a completed line, the walls still bite, and 512 cells against
108 cubes gives a maximum fill of 21% — open enough to have somewhere to go,
closed enough to frame at one zoom level.

This is the single most likely default to be wrong. It is `cfg.volume`, and
`qwirkle3d-tight` (6), `qwirkle3d-open` (10) and `qwirkle3d-unbounded` are
rulesets in the first probe sweep.

### Why no gravity

Gravity turns the bottom layer into a bottleneck and the game into a stacking
puzzle: the question becomes "can I reach that cell" rather than "which three
lines do I want". The twist we are testing is 3-axis line-joining. Gravity is a
different experiment, so it ships as `qwirkle3d-gravity` and gets measured rather
than assumed away.

## Reading a solid: the interaction problem

**An enclosed empty cell is a legal move you cannot click.** This is the 3D-only
failure mode and it has no analogue anywhere else in this repo. A cell whose six
neighbours are occupied is a perfectly legal placement target under the rules,
invisible from every camera angle, and unreachable by a pointer. Ignore it and
the game silently hides its best moves.

Three things address it, and all three are required:

**1. The build plane is the input surface.** The player picks a depth along the
current view axis with a slider or the scroll wheel. Cells on that plane render
as a flat 8×8 grid and are clickable; everything in front of the plane is culled,
everything behind it is dimmed. This is the voxel-editor answer and it makes
every cell in the volume reachable in at most one slider move.

**2. The slice strip is the legibility surface.** All eight layers of the current
axis, laid out as small 2D boards in a row. This is the only view that shows the
whole interior at once, and it is a full-fidelity targeting surface, not a
minimap — a player who prefers it should be able to play the entire game there.
Expect that to happen. Instrument which surface placements come from; if the 3D
view is used for nothing but admiring the result, that is a finding, not a bug.

**3. The camera snaps.** Eight azimuths × three elevations, animated between
stops. A free orbit produces angles where two axes project onto nearly the same
screen direction and the board becomes unreadable; snapping guarantees that never
happens, keeps "which way is X" learnable, and makes the projection a pure
function of a small enum instead of a float.

### The renderer

Axis-aligned unit cubes on a lattice sort **exactly** back-to-front by the dot
product of their cell coordinate with the view direction. With a snapped camera
the signs are fixed per octant, so a painter's algorithm is correct — no z-buffer,
no depth peeling, no 3D library.

That buys the thing this repo cares about most:

```ts
project(cubes: CubeBoard, camera: Camera): DrawList     // pure
pick(point: Screen, camera: Camera, plane: number): Coord | null   // pure
```

Both unit-testable with no browser, on the same standard as `hands.ts` and
`cribbage.ts`. `pick` is the one that will have bugs, and it is the one a smoke
test cannot catch — a mis-picked cell is a legal move that lands in the wrong
place, which looks like a rules bug and isn't.

Three.js is permitted as a fallback if hover-picking or transitions turn out to
need it. It bundles and inlines fine. It is a last resort because it is ~600 KB
in an artifact that is currently dependency-light, and because none of it would
be testable.

### Preview, and the mobile lesson

The preview contract does not change: **you always see the score before the cube
lands.** Targeting a cell shows all three lines it would join, each with its
length, its validating attribute, and whether it validates at all — plus the
total. An illegal target says *which* of the three lines rejects it. In 2D you
can see why a move is illegal; in 3D you cannot, so the preview has to say it.

Touch is in scope from day one. `README.md` records the last PRD scoping
responsive layout out and having that reversed after the fact; the two-step
target/commit flow that came out of it is the right pattern and it is specified
here rather than discovered again. Depth adds one control — the plane slider —
which is a natural thumb gesture and should be a vertical drag on the board edge.

## Metrics, and what "good" is

The probe is not optional and it is not last. `tools/probe.test.ts` already plays
every ruleset over 20 seeds with greedy, careless, 2-ply and beam agents; the
adapter for a new structure is small (`roomApi`/`roomMoves` is the worked
example). It ships in the first third of the build order, before any tuning.

Inherited metrics, with the recalibrated hex-sprawl reference line:

| Metric | Hex sprawl | Target here | Reads as |
|---|---|---|---|
| Lookahead lift (2-ply ÷ greedy) | 1.12 | **≥ 1.20** | Are there setup plays? |
| Skill gap (greedy ÷ careless) | — | **≥ 2.0** | Is playing well worth anything? |
| Choice spread (best ÷ median) | 4.3 | **≤ 8.0** | Are most cells dead? |

New, and specific to three dimensions:

| Metric | Target | Reads as |
|---|---|---|
| **Axis fan-out** — share of placements joining 2 / 3 lines | ≥ 25% join ≥2, 5–15% join 3 | Is the third axis live, or decoration? |
| **Qwirkle rate** | 3–8% of placements | Is the payoff reachable and rare? |
| **Keystone rate** | < 1% | Is the ceiling a ceiling? |
| **Buried legal cells** — legal cells with ≥5 occupied neighbours | report, no target | How much does the UI have to dig out? |
| **Occlusion** — placed cubes invisible at the default camera | report, no target | How much is the 3D view lying? |
| **Stall rate** — runs ending with legal moves the player could not find | **0%** | Correctness, not tuning. |

**Axis fan-out is the metric that answers question 1.** If lift stays at hex's
1.12 while scores inflate 40%, the third axis is a score multiplier wearing a
decision's clothes, and the honest write-up says so. That result would be worth
more than a successful one, because it would be the second time this project
measured a mechanic that felt deep and wasn't.

Nothing gets tuned by eye. `FINDINGS.md` records two measurement bugs found
mid-run, the second of which invalidated a whole column, and `ROOMS.md` records
published numbers being voided twice. Calibrate from the probe or don't calibrate.

## Architecture

The spine does not change. What is new is a structure and a renderer.

```
Game          bag, hands, turn order, running total     (engine.ts, unchanged)
  └─ CubeBoard   ReadonlyMap<"x,y,z", Cube>             (new, mirrors HexBoard)
  └─ Camera      snapped orbit → pure projection        (new)
```

`Structure<CubeBoard, Coord3, CubePlacementScore>` satisfies the existing
six-call interface in `src/engine.ts` — `empty`, `anchor`, `isLegal`,
`legalCells`, `withCard`, `scorePlacement` — so deal, place, exchange and settle
are inherited rather than rewritten, exactly as `hex/game.ts` does.

One genuine extension is needed: `scorePlacement` takes a single coordinate, and
Qwirkle turns place several cubes at once. Add `scoreTurn(board, placements[])`
alongside it rather than changing the existing signature; the single-cube case
delegates to it with an array of one. Nothing in the grid or hex modes moves.

**What transfers.** `deck.ts`'s mulberry32 and seeded shuffle (retyped from
`Card` to `Cube`); `engine.ts` entire; the rulesets-as-data pattern in
`rulesets.ts`; the probe harness and its four agents; the drag/preview/targeting
UI including the touch two-step; `tools/smoke.mjs`; the `prefers-reduced-motion`
convention and the three-layer depth treatment in `index.css`.

**What does not.** Every lens. Qwirkle scoring is not a lens — a lens turns a
line into chips or mult under a hand table, and a Qwirkle line is worth its
length. `src/lens/` is not involved and should not be made to be. Likewise every
calibrated `targetScore` and every row of `metrics.generated.ts`.

**Standing rule.** The existing modes stay working. `npm test` covers them,
`npm run smoke` drives them; this is additive, and any item that seems to need a
change to how grid, hex or rooms score is the wrong item.

## Build order

One item per sitting, each finished and playable. The ordering is deliberate:
rules, then measurement, then presentation — with the interaction spike pulled
forward to item 4 because it is the risk that can end the project.

| # | Item | Done when |
|---|---|---|
| 1 | `Cube`, the 108-cube bag, seeded shuffle | Distribution test: 108 cubes, 3 of each of 36 combinations. |
| 2 | `cube/coords.ts` — keys, 6-neighbourhood, bounds, line extraction on 3 axes | Line extraction tested against hand-built boards, including lines through the origin and against a wall. |
| 3 | `cube/board.ts` — line validity, legality, `scoreTurn` | Every rule in this document has a test. Qwirkle = 12, Keystone = 36, no line double-counted in a multi-cube turn. |
| 4 | **Interaction spike** — orthographic projection, snapped camera, build plane, `pick` | You can click any of 512 cells, including one fully enclosed, and `pick` has unit tests. Ugly is fine here. |
| 5 | `Structure` adapter + `createEngine` wiring; solo runs end to end | A run plays start to finish. Smoke test extended with a cube path. |
| 6 | Probe adapter and the first sweep | Table for `qwirkle3d-baseline`, `-tight`, `-open`, `-unbounded`, `-gravity`. **No tuning before this lands.** |
| 7 | Preview panel — three lines, validity, total, and the rejection reason | Every illegal target names its rejecting axis. |
| 8 | Slice strip as a first-class targeting surface | A whole game is playable without ever touching the 3D view. |
| 9 | Calibration from item 6's numbers; volume and budget fixed | Targets derived from measurement, written down with their source. |
| 10 | Presentation pass — depth treatment, place/clear animation, reduced-motion | Matches `index.css`'s existing three moves. |
| 11 | Hot-seat 2P | Turn order, per-player score, the blocking play exists. |
| 12 | AI opponent = probe agents at three difficulties | greedy / careless / 2-ply, exposed as Easy / Medium / Hard. |

Item 12 is nearly free and worth saying out loud: **the measurement harness and
the opponent are the same code.** The probe already contains a competent Qwirkle
player; exposing it costs a wrapper.

## Risks

**The third axis is decoration.** Scores rise, lift doesn't. Detected by axis
fan-out against lift in item 6. Mitigation is the volume variants — a tighter box
forces intersections — and if those don't move it, the honest finding is that 3D
Qwirkle is 2D Qwirkle with inflation.

**The board is unreadable.** Detected by a human in item 4, not by a metric.
Mitigated by the slice strip, which is why the strip is item 8 rather than a
stretch goal. The fallback position, if the 3D view never becomes the primary
surface, is that this is a *layered* Qwirkle with a 3D visualisation — which is
still a game, and should be named as such rather than pretended out of.

**Scores inflate past every inherited intuition.** Three lines per placement and
a 36-point ceiling mean nothing calibrated for grid or hex transfers. Handled by
refusing to tune before item 6.

**Multi-cube turns explode the move space.** Placing up to 6 collinear cubes from
a hand of 6 makes the 2-ply agent expensive. Cap the probe's turn search at 3
cubes if the sweep runs long, and record that the measured lift is therefore a
lower bound.

**Solo cannot see the best part of Qwirkle.** Denying an opponent a Qwirkle is
the strategic heart of the real game and no solo metric touches it. The 2-ply
agent is a proxy for it and a poor one. This is why hot-seat is in the build
order and not in Deliberately absent.

## Deliberately absent

Per-face cube symbols and rotation as game state; a third piece attribute;
gravity or physics in the default ruleset; free camera; networked multiplayer;
persistence; sound; run progression, economy, shop, items; procedural volumes;
scoring lenses.

**On per-face symbols**, because it is the first idea everyone has: painting six
different symbols on a cube adds a state dimension the player cannot see from any
single camera angle, forces an orientation choice on every placement, and makes
"what is that cube" a question instead of a glance. It is a different game and
possibly a good one. It is not this one, and it would confound the only two
questions this prototype exists to answer.
