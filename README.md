# Grid Card Prototype

A mechanics test, not a game. Built to answer two questions:

1. Does placing a single card and scoring **every line it joins** produce satisfying decisions?
2. Does splitting chips onto the horizontal axis and mult onto the vertical axis create real
   positional tension, or does it collapse into "always play at intersections"?

The spine never changes — place a card, it joins lines, the lines score. What swaps is the
**lens**: how a line of cards becomes a number. Poker was the first; cribbage is the second.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # hands.ts + board.ts unit tests
```

Runs on desktop and on a phone. No backend, no persistence.

## Kangaroo racks

A second, unrelated tool behind the **Kangaroo** button — a manual hunt for
*kangaroo words*, words carrying a synonym inside them (`lager` carries `ale`).

Type a word to get a rack of letter tiles. **+ child** copies that rack's
letters onto a new rack below it; drag letters into the tray to remove them,
rearrange what is left, and the caption tells you what the rack now spells.
Children can only ever lose letters their parent had, so the tree stays honest.

It has no dictionary and does no spell check — it is game pieces, not a judge.
Autosaves to `localStorage`, undo covers everything, and every drag has a
tap-only and keyboard equivalent. Design notes in `KANGAROO.md`.

```bash
npm run smoke:kangaroo   # drives the lager -> ale flow in a real browser
```

## How to play

- **Drag a card straight onto the board** — the preview updates live as you pass over cells,
  and dropping on a highlighted one places it. Works with a mouse or a finger.
- Or click/tap a card to select it, then target a legal cell. The preview shows the resulting
  row-line, col-line, and `chips × mult = score` before you commit.
- Commit to place. The score log records the breakdown.
- Select 1–5 cards and hit **Discard** to cycle them. Costs a discard charge, not a placement.
- Seed box + **New run** replays an identical deck. **Undo** rolls back board, hand, deck,
  score, and log in one step (it also undoes discards). On a phone these live behind **Dev**.

### Pointer vs. touch

The preview is the whole point of the prototype, and touch has no hover — so targeting and
committing are separate steps there:

| | Target a cell | Commit |
|---|---|---|
| Mouse | hover | click |
| Touch | first tap | **Place** button, or tap the same cell again |
| Either | drag over a cell | release on it |

Drag is one pointer-events path for mouse and touch — no HTML5 drag-and-drop, which has no
touch story. A press that moves less than 6px falls through to selection, so click-to-select
is untouched.

You always see the score before the card lands. On touch, **Cancel** clears the target, and
tapping a different hand card re-scores the same cell — which is the fastest way to compare
two candidates for one spot.

Board tint legend: sky = the row-line feeding chips, amber = the col-line feeding mult.
Violet edge bars = row-line at the cap; pink edge bars = col-line at the cap. A line at the
cap can never be extended.

### Screen layout

The breakpoint is 1280px. Above it: board, preview lane, and score log side by side, fixed
height, log scrolls internally. Below it: single column, the preview and hand dock to the
bottom of the screen, and the page itself scrolls. Cell and card sizes come from the `--cell`
and `--hand-card-w` custom properties in `index.css`, which are `min()` expressions against
the viewport — so the 7x7 grid fits any width down to a small phone without a media query.

## Code structure

Pure logic is fully isolated from React — no React import below `App.tsx`.

| File | Contains |
|---|---|
| `src/config.ts` | Every tunable number. Target, counts, grid size, line cap, hand table, rank values, partials toggle. |
| `src/deck.ts` | Card types, mulberry32 PRNG, seeded shuffle, draw. |
| `src/hands.ts` | Poker hand evaluator. `Card[]` → `{ handName, chips, mult, partial, scale }`. |
| `src/lens/` | Scoring lenses. `Card[]` + role → `{ name, items, value }`. `poker.ts`, `cribbage.ts`. |
| `src/rulesets.ts` | Every variant, as data. A variant is a `Config`, not a branch. |
| `src/board.ts` | Board state, legality, line extraction, placement scoring. |
| `src/game.ts` | Pure run-state transitions (`newGame` / `placeCard` / `discardCards`). |
| `src/App.tsx`, `src/components/` | Rendering and interaction only. |

Every pure function takes an optional `Config` as its last argument, so a retuned table can be
tested without touching the global.

## Lenses

A lens converts one line of cards into either chips (row) or mult (column). `board.ts` never
knows which is in use, so swapping poker for cribbage changes no board, drag, or preview code
— the preview renders whatever itemisation the lens returns.

**Cribbage** counts fifteens, pairs, runs and flushes. Unlike poker's single best-hand
category it is *additive and combinatorial*, so a line's value grows faster than its length,
and a two-card line already scores if it makes a fifteen or a pair.

Getting cribbage right means two rank orderings that must not be confused: face cards are
worth **10** towards fifteens but sit at **11/12/13** in a run, and the ace is low only, so
K-A-2 is not a run. Both are covered by tests, along with the perfect-29 hand and double runs.

A flat `baseChipsPerCard` sits under the count. Without it a line with no count scores
literally zero, half of every turn's moves are worthless, and the choice spread blows out to
24× — measured, not assumed. The `Cribbage — pure count` ruleset turns it off so the
trade-off stays visible.

## Rulesets

Every experiment is a `Config` in `src/rulesets.ts`, picked from the **Rules** menu.
Switching restarts the run on the same seed, so two variants can be played back to back on an
identical deck.

## Tuning

All constants live in `src/config.ts`. The open question from the PRD is exposed as:

```ts
partialHands: {
  enabled: false,             // <- the one-line change
  minCards: 3,
  scaleByLength: { 3: 0.5, 4: 0.75 },
}
```

With it off (the default), straights and flushes need a full 5-card line. With it on, a line
that is *entirely* a 3- or 4-card straight/flush scores at the scaled rate — e.g. a 3-card
flush is 35 × 0.5 = 18 chips / ×2 instead of 35 / ×4. It only relaxes Straight, Flush, and
Straight Flush; a 3-card trips was already a real Three of a Kind and is never scaled.

Note the evaluator reads a *whole line* as one hand, so a 5-card line containing a 4-card
straight is not a straight — same as poker. Partials are about short lines, not sub-hands.

## Measured comparison

`npm run probe` plays every ruleset over 20 seeds with three agents — greedy
(best move now), careless (samples across the move distribution), and a 2-ply
lookahead — and reports the table below.

Runs play the **full placement budget** rather than stopping on a win. Stopping
early made scores incomparable across rulesets: a higher target meant a longer
run, a bigger score, and a wider apparent skill gap that had nothing to do with
the mechanics. Win rate is derived afterwards, which is exact because score only
accumulates.

| ruleset | target | greedy | careless | skill gap | 2-ply lift | mult live | spread | min cells | win |
|---|---|---|---|---|---|---|---|---|---|
| poker-baseline | 300 | 599 | 359 | 1.67 | **1.00** | 29% | 5.3 | 10 | 100% |
| poker-tight | 540 | 599 | 336 | 1.78 | 1.06 | 29% | 5.3 | 10 | 85% |
| poker-mult-amped | 620 | 786 | 362 | 2.17 | 1.09 | 50% | 4.0 | 10 | 85% |
| poker-partials | 300 | 656 | 343 | 1.91 | 1.10 | 35% | 5.6 | 10 | 100% |
| poker-short-run | 370 | 377 | 231 | 1.63 | 1.06 | 20% | 5.0 | 10 | 65% |
| poker-partials-generous | 700 | 706 | 378 | 1.87 | **1.25** | 37% | 5.7 | 10 | 50% |
| poker-flat-ranks | 435 | 440 | 275 | 1.60 | **1.00** | 34% | 4.0 | 10 | 50% |
| poker-short-lines | 520 | 523 | 348 | 1.50 | 1.15 | 30% | 4.8 | **2** | 55% |
| poker-long-lines | 660 | 667 | 379 | 1.76 | 1.07 | 24% | 6.4 | 12 | 55% |
| poker-lean-hand | 545 | 549 | 335 | 1.64 | 1.13 | 27% | 5.4 | 10 | 50% |
| poker-small-board | 440 | 445 | 300 | 1.48 | 1.11 | 18% | 5.0 | 8 | 55% |
| **cribbage** | 600 | 621 | 258 | **2.41** | **1.21** | 44% | 7.0 | 10 | 55% |
| cribbage-unbound | 1050 | 1032 | 270 | **3.82** | 1.18 | 30% | 15.0 | 13 | 45% |
| cribbage-pure | 450 | 504 | 132 | **3.82** | **1.23** | 17% | 24.0 | 10 | 60% |
| cribbage-lean | 500 | 522 | 240 | 2.17 | **1.21** | 42% | 6.0 | 10 | 60% |
| cribbage-flush3 | 660 | 666 | 282 | 2.36 | 1.14 | 45% | 7.0 | 10 | 55% |

- **Lookahead lift is the sharpest metric.** Poker's baseline sits at **1.00** —
  planning one move ahead gains nothing at all, so there are no setup plays to
  find. Cribbage runs 1.21-1.23.
- **Skill gap** (greedy ÷ careless) puts cribbage at 2.41 against poker's 1.67.
- **Mult live** (placements where mult > 1) goes from 29% to 44%, because a
  two-card cribbage line can already count where a poker one cannot.
- **Spread** (best move ÷ median move) is the guard rail the other way. Cribbage
  at 7.0 is sharper than poker's 5.3 without being degenerate; `pure count` at
  24.0 is what "most moves are worthless" looks like, which is why the flat base
  chip exists.
- **`short-lines` chokes**: min legal cells 2 versus 10 elsewhere.

## Presentation

Depth comes from three repeated moves, defined once in `index.css` as `.card-face`,
`.board-tray`, `.panel`, and `.panel-inset`: a top-lit gradient, a 1px light seam on the top
edge, and a shadow separating each layer from the one behind it. Cards sit on the board; the
board is recessed into the page.

Three animations, all decorative — no state change ever waits on one:

| | Trigger |
|---|---|
| `deal-in` | a card id appears in hand that was not there last render, staggered by slot |
| `discard-fly` | discarded cards are frozen at their screen position and animate away while the hand refills underneath |
| `place-drop` | the cell named by the newest log entry |

All of it collapses under `prefers-reduced-motion`.

## Deliberately absent

Jokers, consumables, shop, economy, multiple blinds, run progression, deck building,
sound, persistence, AI opponent.

## Two deviations from the PRD

**Mobile.** The PRD scoped responsive layout out and specified desktop, mouse-driven. That was
reversed after the fact. The only part that needed a real design decision was the preview,
since it was hover-driven and a finger has no hover — hence the two-step target/commit flow
above. Desktop behaviour is unchanged: hover still previews, one click still places.

**End of run.** The PRD lists "deck runs out" as a loss condition. With 15 placements against a 52-card deck
the deck cannot actually empty, so ending a run with a full hand would only ever be a bug.
The implemented terminal check is: placements exhausted, **hand** empty, or no legal cell
anywhere on the board. The third case is reachable — the line cap can seal off a small
cluster — and would otherwise soft-lock the run.
