# game-experiments

A repo of small, separate game prototypes. One folder per game under `games/`.

These are guidelines, not a framework. They exist to stop two specific failures:
games bleeding into each other, and design documents growing faster than the
game does. Where a guideline gets in the way of a good prototype, the prototype
wins — say so in the game's README and move on.

## Each game is its own game

`games/<name>/` is self-contained: its own `package.json`, its own build, its
own README, its own docs. It runs without any other folder in the repo existing.

**Never import across game folders.** If a sibling has something you want, copy
it in and let the two copies diverge. Coupling two prototypes to save fifty
lines costs more than the fifty lines, every time — the moment one game needs
the shared thing to behave differently, both games are stuck.

**Read siblings for technique, not for design.** How another game handles touch
targeting, seeds a shuffle, or structures its tests is worth borrowing. Its
mechanics, its architecture, its scoring vocabulary and its measured results are
*that game's*, and carrying them over produces a variant of the old game wearing
a new name. A new game starts from what it is trying to be, not from what is
already in the repo.

`tools/` at the root is build and environment infrastructure only — signing,
browser launch, anything about this container. Never game logic.

## Ship something playable first

The bar for a first session on a new game is: **a human can play it in a
browser.** Ugly, unbalanced, one mode, placeholder art, half the rules missing —
playable beats complete.

Everything else is easier after that. You find out what the game feels like,
which of your design questions were real, and which were invented. Prototypes
die from being designed for three sessions before anyone touches them, not from
shipping rough.

Then iterate in playable increments. Every commit should leave a thing you can
still open and play.

## Write the smallest spec that gets you building

A game folder's README says what the game is, how to run it, and what you are
currently unsure about. That is usually enough to start.

Write more only when you actually need it — rules genuinely too fiddly to hold
in your head, or a decision worth recording because you will otherwise re-argue
it. A spec is a starting point, not a contract: when the built game disagrees
with the document, the document is wrong. Delete the parts that reality has
overtaken rather than maintaining them.

Long design documents are a symptom worth noticing. If one is getting long
before anything is playable, stop writing and go build.

## Measure only to break a tie

Instrumentation, agents, sweeps, and metrics are a tool for answering a specific
question that playing the game could not answer — "is this choice actually a
choice, or does one option always win?" They are not a deliverable and not a
prerequisite.

Build one when you are genuinely stuck on a tuning decision, make it the
smallest thing that answers that question, and stop there. Do not build a
measurement harness before there is a game to measure, and do not let a number
overrule the fact that something is fun.

Playtesting is the primary evidence. A metric is a way of checking a suspicion
you already formed by playing.

## Test what silently breaks

Rules and scoring get tests — a wrong scorer invalidates every playtest done
against it, and it fails quietly. Layout, animation and styling do not; you can
see those.

Keep game logic separable enough from rendering that you can test it without a
browser. That is the only architectural constraint here, and it is worth it.

## Practical defaults

Vite + TypeScript + React, because it is what the existing games use and it
builds to a single static bundle with no backend. Not a rule — if a game wants
canvas, plain TS, or something else entirely, take it.

- Seeded RNG, so a run can be replayed and a bug reproduced.
- No backend, no persistence, no accounts, unless the game is about that.
- Runs on a phone. Touch is not a port; design for it as you go.
- Tunable numbers in one place, so balance is an edit and not a search.

## Starting a new game

```
games/<name>/
  README.md        what it is, how to run it, what's open
  package.json     its own; `npm install` at the root picks it up
  src/
```

Root is an npm workspace over `games/*`. From inside a game folder the usual
`npm run dev` / `npm test` / `npm run build` work as normal.
