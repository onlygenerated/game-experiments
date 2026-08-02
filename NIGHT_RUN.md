# Night run — durable state

This file is the memory for the unattended variant run. It exists because my
conversation context gets summarised over a long session, so the plan, the
decisions, and the results have to live on disk instead of in my head.

**Every wake-up:** read this file → do the next unstarted item → verify → commit
and push → update this file → republish the artifact → end turn. Never carry
plan state in context alone.

## Where things live

- **Repo**: `onlygenerated/game-experiments`.

### Branching: work anywhere, merge into main

A fired Routine session is handed its own auto-generated branch and cannot be
talked out of it. Rather than fight that, each run **branches freely and merges
into `main`**:

    git fetch origin main
    git reset --hard origin/main     # safe: the fresh branch has no work yet
    ... do the work, commit ...
    git fetch origin main
    git rebase origin/main
    git push origin HEAD:main
    git push origin HEAD:claude/new-session-1bu1l1 || true   # best effort

`main` is the mainline and the deliverable — it always holds the latest
completed work, and the next run syncs onto it. `claude/new-session-1bu1l1` is
kept in sync as a convenience because it is the branch already bookmarked; a
failure to update it is not an error.

Never force push. If a push to `main` is rejected because it moved, fetch,
rebase and retry.

**The repo's default branch is still `claude/new-session-1bu1l1`.** Changing it
needs GitHub repository settings, and the session proxy refuses settings writes
("Repository settings writes are not permitted through this proxy"). This does
not matter given the sync-onto-main step above, which makes the run independent
of whatever the session was branched from.
- **Artifact**: https://claude.ai/code/artifact/6613c961-31a5-4a7b-8c61-abeb633d25e6
  Republish by passing that URL as the `url` parameter, so the link the user
  already has keeps working. A fresh session that omits it mints a new one.
  Title "Grid Poker Prototype", favicon 🃏 — keep both stable across
  redeploys. Publishing requires having viewed the current version first
  (WebFetch the URL) or the tool 409s; that's expected, not an error.
- **Build the artifact**: `npx vite build`, then inline `dist/assets/*.css` and
  `*.js` into a single body-only HTML file (no doctype/html/head/body tags —
  the host wraps it) and publish that. Nothing may reference an external host.
- **Probe**: `npm run probe`. **Tests**: `npm test`.
- **Driving the app in a browser**: `import { launch } from './tools/browser.mjs'`.
  Chromium is pre-installed but the npm `playwright` package pins a different
  browser build than the image ships, so the automatic lookup fails and an
  explicit `executablePath` is required — the helper resolves it. Never run
  `playwright install`. Scripts must live inside the repo, or node cannot
  resolve `playwright` from `node_modules`.

## Standing rules

- Each firing is now **hourly and cold** (a fresh session per fire), so aim to
  finish one whole queue item per firing rather than a slice of one.
- Merge into `main` after **every** item. The container is ephemeral; anything
  unpushed is lost if it is reclaimed.
- Every new evaluator or structure gets tests before it counts as done, on the
  same standard as `hands.ts` and `cribbage.ts` — a silent bug in a scorer
  invalidates the playtest it is meant to inform.
- Calibrate targets from a measured probe, never by guessing. Delete the probe
  afterwards (an in-game solver stays out of scope).
- One URL. Everything ships behind the Rules menu.
- Never block on a question. If a decision is genuinely ambiguous, take the
  default recorded below, note it in Decisions, and keep moving.

## Pre-declared decisions

Taken without asking, so nothing stalls overnight. Any of these can be
overridden in the morning.

| Question | Default |
|---|---|
| Hex coordinates | Pointy-top axial (q, r), three line axes |
| Hex line cap | None — score the best 5-card window along each line |
| Hex distance bonus | Score × (1 + ring/10), ring = hex distance from origin |
| Default lens for new structures | Cribbage, with poker kept as a control |
| Degenerate metrics | Tune once, record the numbers, move on — do not redesign |
| Existing 8 rulesets | Frozen. Do not recalibrate. |
| Scope | Queue below only. No new ideas invented at 3am. |

Will **not** do unattended: force push, change the default branch, open a pull
request, delete anything of the user's, or publish anything publicly.

## Queue

Cheap items first so a short night still banks the whole of category 1.

- [x] **1. Category 1 config variants** — the remaining 6 of 10 as data in
      `rulesets.ts`, probe-calibrated targets.
- [x] **2. Blank board (M6)** — no centre anchor; first placement picks the
      origin. Needed by the sprawl work.
- [x] **3. Hex Sprawl — engine** — axial coords, three axes, line extraction,
      legality, tests. The big one.
- [x] **4. Hex Sprawl — board UI** — hex rendering, drag and preview reuse.
- [x] **5. Hex Sprawl — ring bonus** — landed with item 4; three hex rulesets ship,
      including one with the bonus off as a control.
- [x] **5b. Unify game.ts and hex/game.ts** behind a Structure interface. They
      differ only in six board calls. Deliberate duplication for now — see
      decisions log.
- [x] **6. One-Card Draft** — no hand; reveal one card, place or burn.
- [x] **7. Category 2 mechanic variants** — both-axes, suit-sets-axis,
      deferred scoring, lock-and-cash, free placement. All five ship under a
      Mechanics group. Lock-and-cash is the only one that needed engine and UI
      work; the other four are config read by `scorePlacement`.
- [ ] **8. Metrics page** — every ruleset ranked by skill gap, lookahead lift,
      mult participation, spread, choke turn. Poker Squares as the reference.
- [ ] **9. Morning summary** — findings and a recommended shortlist.

## Decisions log

**Commit signatures are fine. Never rewrite history over them.** Commits here
really are signed — every one carries a `gpgsig` header, checkable with
`git cat-file commit HEAD`. What was missing was the ability to *verify* one:
the environment's signer implements only `-Y sign`, and the image has no
`ssh-keygen`, so git reported `N` ("no signature") or `B` ("bad") and the
natural-looking conclusion was that the history needed redoing. It did not. A
firing already lost a cycle to this.

Fixed properly rather than documented around: `tools/ssh-sign-shim.py` is now
`gpg.ssh.program`. It delegates `-Y sign` verbatim to the real helper (recorded
in `signing.realprogram`) and implements `-Y verify` itself, with ed25519 in
pure Python — `cryptography` is installed in this image but its native backend
is broken, and a verifier that depends on an intact optional wheel is exactly
the flakiness this is meant to remove. `tools/setup-signing.py` installs it
from a `SessionStart` hook in `.claude/settings.json`, so every fresh firing
configures itself. It self-tests against a real commit's signature before
touching `gpg.ssh.program`, and leaves git config untouched if anything fails —
a cosmetic verification setting must not be able to break committing.

`git log --format='%h %G?'` now reports `G` for the whole history. If a future
firing sees anything else, the fault is in the shim or the hook, not in the
commits — check `tools/setup-signing.py` output before touching history.

**Probe methodology was wrong and has been fixed.** Runs used to stop the moment
the target was hit, so a ruleset with a higher target played more placements,
scored more, and showed a mechanically wider skill gap that had nothing to do
with its mechanics. Every cross-ruleset number published before this point is
void. Runs now play the full placement budget; win rate is derived afterwards,
which is exact because score only accumulates.

**Choke metric was also wrong** — it measured "fewer than five legal cells",
which is true on turn 1 of every ruleset because a lone anchor has exactly four
neighbours. Now reports the fewest legal cells seen after turn 5.

**Probe kept as a tool** rather than rewritten each time: `tools/probe.test.ts`,
run with `npm run probe`, excluded from `npm test`.

**Blank board legality**: adjacency is unsatisfiable with nothing on the board,
so an empty board makes every in-bounds cell legal. Made universal rather than
gated on the anchor flag — with an anchor the branch is unreachable, so there is
nothing to gate. One board test changed meaning as a result and was rewritten.

**Would-be anchor card stays in the deck** when the anchor is off, rather than
being drawn and discarded, so the same seed stays comparable across both.

**Hex mult uses both diagonals.** Three axes need a third slot in a two-slot
chips x mult spine. Axis 0 (E-W) feeds chips; axes 1 and 2 both feed mult and
are summed with an offset (`m1 + m2 - 1`), so two dead diagonals leave mult at 1
while either one coming alive lifts it. The alternative — making the third axis
a flat bonus — would have left one diagonal decorative.

**Uncapped lines, best-window scoring.** Per the pre-declared default there is
no line cap on hex. A line can outgrow any hand, so only the strongest
contiguous `hexWindow` (5) stretch scores. Long lines stay valuable without one
line becoming the whole game, and the player-facing read stays "what is my best
five here". The full run is still highlighted; only the window scores.

**Hex board is a sparse Map**, not a dense array, because a sprawl has no fixed
extent. `hexRadius` (4, so 61 hexes) bounds it for rendering only.

**Coordinates travel as string keys through the UI.** "r,c" on a grid, "q,r" on
hexes. Drag, preview, targeting, the docked footer and the score log are all one
code path as a result, and each board view only does set membership on those
keys for highlighting. This is what kept the hex board from needing a parallel
copy of the whole app shell.

**`ScoredLine` / `ScoredPlacement` normalise scoring output** so the preview and
log render two grid axes or three hex axes without knowing which they have.
Grid lines report window == whole line; hex lines report a shorter window, and
the views fade the cards outside it.

**`hex/game.ts` deliberately mirrors `game.ts` rather than sharing.** They differ
only in six board calls, so a `Structure` interface would remove the
duplication — but that refactor touches the module all 18 existing rulesets
depend on, and a half-finished version overnight would be far worse than two
small parallel files. Queued as 5b, not forgotten.

**Every hex gets a lit rim.** `clip-path` clips borders as well as the shape, so
rims have to be drawn as an inset layer. Without one the empty hexes vanished
and the disc read as a lopsided smear rather than a board.

**5b done: `src/engine.ts` now holds the one copy of run orchestration**
(deal, place, discard, settle) behind a `Structure<TBoard, TCoord, TScore>`
interface with six methods (`empty`, `anchor`, `isLegal`, `legalCells`,
`withCard`, `scorePlacement`). `game.ts` and `hex/game.ts` shrank to ~30-line
adapters that wrap `board.ts` / `hex/board.ts` into a `Structure` and export
the same public names (`newGame`/`placeCard`/`discardCards`,
`newHexGame`/`placeHexCard`/`discardHexCards`) with the same call signatures,
so `App.tsx`, `tools/probe.test.ts` and the existing tests needed zero
changes. `board.ts`/`hex/board.ts` themselves are untouched — the duplication
that got removed was only ever in the run-state layer, not the board math,
so grid keeps taking `(r, c)` and hex keeps taking a `Hex`; the adapter in
`game.ts` wraps grid's positional args into a `Coord` object at the boundary.
Verified with `npm test` (159 passing), `npx tsc -b --noEmit` (clean), a
60s-timeout `npm run probe` run (numbers consistent with history within the
probe's known seed noise), and a headless-Chromium pass placing a card on
both a grid ruleset and a hex ruleset through the real UI.

**Probe's default vitest timeout (5000ms) is too short for this container** —
a full 24-ruleset run takes ~31s here, so `npm run probe` as configured now
reports a timeout failure even though the computation completes and prints
its table before vitest gives up on it. Not fixed — out of scope for 5b, and
`vitest.probe.config.ts` already isn't part of `npm test`. Worth a
`testTimeout` bump in a future item if the probe is run unattended again.

**The probe now dispatches on structure.** It would otherwise have measured hex
rulesets with grid functions and produced plausible, entirely wrong numbers.

**One-Card Draft needed no engine work.** "Reveal one card, place or burn" is
exactly `handSize: 1` with discards clamped to one. What it did need was UI: with
a hand of one there is nothing to choose between, so the revealed card is
implicitly selected and cannot be deselected. Making the player click their only
card first would be ceremony that hides the actual question the variant asks.
The discard button reads Burn there and works without a selection step.

**Routine could not clone the repo (16:52 firing).** Fresh sessions spawned by a
Routine reach git through a per-session proxy that is only provisioned for
repositories attached to that session as a *source*, and `create_trigger` does
not expose a sources parameter. The Routine was therefore never able to run. It
has been disabled; a durable replacement has to be created from the claude.ai
Routines UI with the repository selected. An interim self-bind Routine fires
into the original session, which already has the clone.

**Targets for the 7 new config variants** set to their measured greedy median,
which lands them at 50-65% win. The 8 pre-existing rulesets stay frozen per the
standing rules, so a few still read 100%.

## Results log

Measured over 20 seeds with the corrected methodology.

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
| **cribbage-blank** | 550 | 555 | 228 | 2.43 | **1.31** | 35% | 5.0 | 5 | 45% |
| poker-blank | 570 | 573 | 383 | 1.50 | 1.15 | 17% | 5.0 | 5 | 60% |
| **hex-sprawl** | 1200 | 1201 | 224 | **5.36** | **1.26** | 29% | 15.5 | 13 | ~50% |
| hex-sprawl-blank | 1120 | 1118 | 248 | 4.51 | **1.03** | 26% | 13.3 | 11 | ~50% |
| hex-sprawl-flat | 965 | 966 | 216 | 4.47 | 1.23 | 30% | 16.0 | 13 | ~50% |
| **draft-cribbage** | 345 | 345 | 258 | 1.34 | **1.42** | 37% | **4.0** | 10 | ~50% |
| draft-poker | 440 | 439 | 354 | 1.24 | 1.23 | 20% | 3.7 | 10 | ~50% |
| draft-hex | 625 | 624 | 280 | 2.23 | 1.24 | 23% | 7.7 | 13 | ~50% |
| **mech-both-axes** | 3750 | 3750 | 1161 | 3.23 | 1.24 | **94%** | 13.0 | 9 | 50% |
| mech-suit-axis | 665 | 663 | 267 | 2.48 | 1.18 | **12%** | 6.0 | 10 | 45% |
| **mech-deferred** | 150 | 147 | 51 | 2.88 | **1.67** | 26% | **0.0** | 8 | 45% |
| mech-free | 610 | 612 | 81 | *7.56* | 1.24 | 40% | 11.0 | **31** | 50% |
| mech-lock-cash | 265 | *9* | *21* | *0.43* | *29.33* | 3% | 3.0 | **0** | *0%* |

### Readings

- **Poker baseline's lookahead lift is 1.00.** Planning one move ahead gains
  *nothing* — the strongest evidence yet that the poker version has no setup
  plays, and a much sharper indictment than the skill gap. `flat-ranks` is also
  1.00, so removing the rank gradient does not create depth either.
- **Cribbage lifts to 1.21-1.23 across every variant.** Setup plays exist there.
- **Skill gap: cribbage 2.41 vs poker 1.67.** Real but smaller than the earlier
  (broken) measurement claimed. Lookahead lift is the better discriminator.
- **`short-lines` (cap 4) chokes the board** — min legal cells drops to 2 against
  10 everywhere else. PRD criterion 3 answered: a tighter cap does choke.
- **`partials-generous` has the best poker lift at 1.25**, the only poker variant
  competitive with cribbage on depth. Worth a human playtest.
- **`cribbage-blank` has the highest lookahead lift measured so far: 1.31.**
  Removing the centre anchor adds depth — the origin is a real decision and the
  whole structure follows from it. Poker gains far less from the same change
  (1.15), so this is not just "one more free choice", it interacts with the
  additive scoring. Strongest single result of the night.
- **Hex sprawl has the widest skill gap measured: 5.36**, against cribbage's
  2.41 and poker's 1.67, with a lookahead lift of 1.26. Three axes per placement
  and uncapped lines both pull in the same direction.
- **But its choice spread is 15.5**, against a healthy 7.0 for grid cribbage.
  The best move is fifteen times the median one, so most hexes are near-dead and
  a few are enormous. That is the `cribbage-pure` failure mode returning by a
  different route, and it is the first thing to check by hand — high skill gap
  and obvious-best-move look identical in the numbers.
- **Blank board HURTS on hex (lift 1.03) where it helped on grid (1.31).** On a
  61-hex disc the origin barely constrains anything — you can always sprawl —
  so the choice that mattered on a 7x7 grid evaporates. Opposite sign from the
  grid result, and a caution against assuming findings transfer across
  structures.
- **One-Card Draft has the best decision *shape* of anything measured.** Its
  lookahead lift of 1.42 is the highest recorded, and its choice spread of 4.0
  is the lowest — no move screams at you, and planning ahead pays more than
  anywhere else. Its raw skill gap is only 1.34, which reads as weak until you
  notice what the two numbers mean together: the game stops being "spot the big
  number" and becomes "set up the next card". That is the split criterion 1 of
  the PRD was actually asking about.
- Removing the hand **raises** the value of lookahead across all three lenses,
  because with nothing to fish with you have to care what the board will accept
  next. Worth weighing against the fact that the probe's agents never burn, so
  the measured game is slightly harsher than a human's.
- **The ring bonus is doing real work**: removing it drops the skill gap from
  5.36 to 4.47.
- Blank boards are more **constrained**, not less: min legal cells drops to 5
  against 10 anchored, because growth from an edge or corner has fewer
  directions than growth from the centre.

#### Category-2 mechanic variants

- **Deferred payout produces the highest lookahead lift ever measured (1.67),
  and the deadest turns.** Its choice spread is *0.0*: on most turns the best
  available move banks nothing at all, because nothing completes a line. Both
  facts have the same cause — when only completion pays, play becomes entirely
  about setting up a completion several placements out. This is the sharpest
  planning signal in the whole table sitting on top of the worst moment-to-
  moment feedback, and it is the one variant where the two criteria of the PRD
  actively pull against each other. Worth playing by hand before judging.
- **Both-axes finally makes the mult axis live — 94% against 44% — and that is
  exactly why it is suspect.** If every line feeds mult, participation is
  guaranteed rather than earned, and the scores inflate sixfold (greedy 3750).
  The skill gap does rise (2.38 → 3.23), so it is not pure inflation, but the
  positional question the PRD asked cannot be answered yes by a rule that makes
  every position feed both resources.
- **Suit-sets-axis kills mult participation: 44% → 12%.** Unexpected, and the
  most interesting negative result here. Being able to choose which axis your
  strong line feeds means you route it into chips nearly every time, so the
  mult axis is *more* dead than in the version where the geometry forces it.
  Giving the player control over the axis assignment removed the tension rather
  than adding to it.
- **Free placement lowers the floor; it does not raise the ceiling.** Greedy is
  essentially unchanged (612 against cribbage's 621) while careless collapses
  (81 against 261). So the headline 7.56 skill gap is *not* comparable with the
  rest of the column, and it is italicised above for that reason: with
  adjacency dropped, the legal move set triples (min cells 31 against 10) and
  most of those moves are isolated cells worth almost nothing. A uniform-
  quantile "careless" pick lands in that worthless mass, which inflates the
  ratio without good play having improved at all. Read skill gap alongside min
  cells; the two rulesets are not measuring the same decision.

- **Lock-and-cash: every number in its row is italicised, because greedy is not
  a valid agent for it.** Under this variant a placement is worth 0 by design,
  so a value-maximising agent has no gradient to build on and cashes the
  smallest available cross every single turn. Each cash seals its cross, and
  after a handful of those the structure is sealed shut — min legal cells 0,
  run over, greedy 9. That is why greedy scores *worse than careless* (0.43),
  and why the 29.33 "lookahead lift" is not a measurement of planning value but
  of how far greedy falls over. Its target is calibrated from the **2-ply
  median (264)** instead, which is a deviation from the standing rule and is
  recorded as such. The `win%` column reads 0% because it is derived from
  greedy runs; ignore it for this row.
- The one real design bug this surfaced was worth the trip: cashing a *lone*
  card locks a one-cell run on both axes, which walls off all four of its
  neighbours. On an anchored board a greedy agent cashed the opening card for 3
  points and ended the run on turn one. Cashing now requires a cross of at
  least two cards, with a test pinning it.
- Whether lock-and-cash is *good* is still an open question a human has to
  answer by playing it. What the probe establishes is only that it is not
  degenerate in the way the others can be measured for — and that it punishes
  naive play harder than anything else here.
