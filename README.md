# Grid Poker Prototype

A mechanics test, not a game. Built to answer two questions:

1. Does placing a single card and scoring **every line it joins** produce satisfying decisions?
2. Does splitting chips onto the horizontal axis and mult onto the vertical axis create real
   positional tension, or does it collapse into "always play at intersections"?

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # hands.ts + board.ts unit tests
```

Desktop browser, mouse-driven. No backend, no persistence.

## How to play

- Click a hand card to select it. Legal cells light up green.
- Hover a legal cell — the preview panel to the right of the board shows the resulting
  row-line, col-line, and `chips × mult = score` before you commit.
- Click the cell to place. The score log records the breakdown.
- Select 1–5 cards and hit **Discard** to cycle them. Costs a discard charge, not a placement.
- Seed box + **New run** replays an identical deck. **Undo** rolls back board, hand, deck,
  score, and log in one step (it also undoes discards).

Board tint legend: sky = the row-line feeding chips, amber = the col-line feeding mult.
Violet edge bars = row-line at the cap; pink edge bars = col-line at the cap. A line at the
cap can never be extended.

## Layout

Pure logic is fully isolated from React — no React import below `App.tsx`.

| File | Contains |
|---|---|
| `src/config.ts` | Every tunable number. Target, counts, grid size, line cap, hand table, rank values, partials toggle. |
| `src/deck.ts` | Card types, mulberry32 PRNG, seeded shuffle, draw. |
| `src/hands.ts` | Pure evaluator. `Card[]` → `{ handName, chips, mult, partial, scale }`. |
| `src/board.ts` | Board state, legality, line extraction, placement scoring. |
| `src/game.ts` | Pure run-state transitions (`newGame` / `placeCard` / `discardCards`). |
| `src/App.tsx`, `src/components/` | Rendering and interaction only. |

Every pure function takes an optional `Config` as its last argument, so a retuned table can be
tested without touching the global.

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

## First playtest reading

A greedy-max probe over 40 seeds (written, run, then deleted — an in-game solver is out of
scope) put the score curve here:

| | min | median | max | win rate |
|---|---|---|---|---|
| Greedy | 300 | 329 | 389 | 100% |
| Deliberately naive | 222 | 281 | 322 | 33% |

Two things worth knowing before the first human run:

- **The 300 target is the right order of magnitude** — criterion 4 passes, tuning does not
  need to move first.
- **But it may be too soft to discriminate.** Greedy clears it in ~9 of the 15 placements,
  and a player choosing badly on purpose still lands at 281. The gap between "playing well"
  and "playing badly" is only about 18%. If the first runs feel tensionless, raise
  `targetScore` (400–450) or cut `placementsPerRun` before concluding the mechanic is flat.
- Best single placement was a median of 68 and a max of 120, which suggests **chips are
  carrying the score and the mult axis is quiet** — the exact failure mode question 2 is
  about, and the reason the partials toggle exists.

## Deliberately absent

Jokers, consumables, shop, economy, multiple blinds, run progression, deck building,
animations, sound, mobile layout, persistence, AI opponent.

## One deviation from the PRD

The PRD lists "deck runs out" as a loss condition. With 15 placements against a 52-card deck
the deck cannot actually empty, so ending a run with a full hand would only ever be a bug.
The implemented terminal check is: placements exhausted, **hand** empty, or no legal cell
anywhere on the board. The third case is reachable — the line cap can seal off a small
cluster — and would otherwise soft-lock the run.
