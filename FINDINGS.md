# Grid Poker prototype — what the variant run found

The PRD called this "a mechanics test, not a game", built to answer two
questions. Thirty rulesets later, both have answers, and neither is the answer
the PRD expected.

Everything below is measured over 20 seeds per ruleset, each run playing its
full placement budget. The numbers live in `src/metrics.generated.ts` and are
readable in the app behind the **Metrics** button. Read the methodology note at
the end before quoting anything — two measurement bugs were found and fixed
during the run, and the second one invalidated a whole column.

---

## Question 1 — does placing one card and scoring every line it joins produce satisfying decisions?

**Under poker scoring, no. Under cribbage scoring, yes.** The lens turned out to
matter more than every other variable combined.

The sharpest measure here is **lookahead lift**: what a two-ply agent scores
divided by what a greedy one does. A game with no setup plays sits at 1.00 no
matter how large its numbers are, because there is nothing to set up.

| | lookahead lift |
|---|---|
| Poker baseline | ×1.09 |
| Poker, ten config variants | ×1.06 – ×1.32 |
| Cribbage, six variants | ×1.18 – ×1.43 |

Ten separate config changes to the poker version — raising the target, steepening
the mult column, flattening rank chips, shortening and lengthening lines,
shrinking the board, thinning the hand, shortening the run — moved the lift
between ×1.06 and ×1.19. None of them created setup plays, because none of them
touched the reason there aren't any.

The one poker variant that got anywhere is **generous partials** (×1.32), and it
works by making poker score *more like cribbage*: partial straights and flushes
earn partial credit, so a line that is halfway to something is worth more than a
line that is nothing. That is the whole mechanism.

**The finding underneath all of it: additive, partial-credit scoring is what
makes a placement decision live. An all-or-nothing hand table kills it.** With
poker hands, a 5-card line either is a straight or is worth its ranks; there is
no gradient to climb, so there is nothing to plan toward. Cribbage counts
fifteens, pairs, runs and flushes additively, so every card added to a line
changes its value by a readable amount, and building toward something is a real
activity.

## Question 2 — does chips-on-rows and mult-on-columns create positional tension?

**Not on its own — and the tension is destroyed the moment the player can choose
the assignment.**

The mult axis in the poker baseline is live on 29% of placements. Nearly three
in four placements, the column you played into contributed ×1: decoration.

Three things were tried:

| | mult live | lookahead lift | verdict |
|---|---|---|---|
| Poker baseline | 29% | ×1.09 | the dead axis the PRD worried about |
| Steeper mult values | 50% | ×1.11 | numerically alive, decisionally identical |
| Cribbage lens | 44% | ×1.26 | alive *and* the decisions got better |
| Both axes feed both | 94% | ×1.24 | guaranteed, not earned; scores inflate 6× |
| Suit decides the axis | **12%** | ×1.18 | **backfired** |

The suit result is the most interesting thing in the run. Letting the player's
card decide which axis feeds chips sounds like it adds a decision. What actually
happens is that you route your strong line into chips every single time, so the
mult axis goes *more* dead than the version where geometry forces the issue —
44% down to 12%. **The tension was coming from not being allowed to choose.**

So the axis split is not what creates positional tension. What creates it is a
lens where both axes can score meaningfully from the same cards, plus no way to
opt out of the weaker one.

---

## Reading the rankings honestly

A high skill gap is not the same as a good game, and three rulesets prove it:

- **`cribbage-pure`** has the widest skill gap measured (×9.33) and a choice
  spread of 24 — the best move on a turn is twenty-four times the median one.
  That is not depth, it is one move screaming at you while the rest are worth
  nothing.
- **`mech-free`** (×8.50) drops the adjacency rule. Greedy play is unchanged
  (612 against cribbage's 621) while random play collapses (72 against 189). It
  lowers the floor; it does not raise the ceiling.
- **`hex-sprawl`** (×5.36) has a spread of 15.5. Most hexes are near-dead and a
  few are enormous.

**Lookahead lift paired with a low choice spread is the combination that means
real decisions**: planning pays, and no single move is obvious. On that reading:

| ruleset | lift | spread | |
|---|---|---|---|
| **One-Card Draft (cribbage)** | ×1.42 | **4.0** | best decision shape measured |
| **Cribbage — blank board** | ×1.42 | 5.0 | close second |
| Poker — generous partials | ×1.32 | 5.7 | best the poker lens manages |
| Cribbage | ×1.26 | 7.0 | the solid middle |
| Hex Sprawl | ×1.26 | 15.5 | promising structure, spiky scoring |
| Deferred payout | ×1.67 | **0.0** | highest planning signal, deadest turns |

One-Card Draft's raw skill gap is only ×1.64, which reads as weak until you see
what the two numbers mean together: the game stops being "spot the big number"
and becomes "set up the next card". Removing the hand raises the value of
lookahead across all three lenses, because with nothing to fish with you have to
care what the board will accept next.

**Deferred payout is the extreme case and worth understanding.** Nothing banks
until a line fills, which produces the strongest planning signal in the run
(×1.67) sitting on top of the worst moment-to-moment feedback (on most turns, no
available move banks anything at all). It is the one variant where the PRD's two
criteria actively pull against each other, and it suggests the interesting design
is somewhere between the two: pay a fraction on placement and the rest on
completion.

## Against Poker Squares

The published classic ships as a reference ruleset — 5×5, one card at a time,
place anywhere, no discards, lines pay when full. It is an approximation (the
classic sums hand values over ten fixed lines at the end; everything here
multiplies chips by mult per placement) and it is labelled as one in the app.

**Its skill gap is ×1.07.** Two agents fill the same twenty-five cells; the one
that picks the best-scoring cell every single turn finishes 7% ahead of the one
choosing at random. Every cribbage and hex variant here beats that by three to
five times, and even the poker baseline beats it 1.85 to 1.07.

That is the clean answer to "why build this instead of the classic", and it does
not depend on any caveat, because both agents face an identical board.

What cannot be claimed: the reference's lookahead lift of ×1.36 looks like it
beats plain cribbage's ×1.26, but the reference trips two of the three caveat
conditions the Metrics page flags — a line only pays on completion, so greedy has
no gradient to follow, and there is no adjacency rule, so the legal move set is
huge and mostly worthless. A lift measured against a degenerate greedy is not the
same quantity. The honest statement is that this comparison cannot be made, not
that we win it.

---

## Recommended shortlist

**Build on these three:**

1. **One-Card Draft with the cribbage lens.** The best decision shape measured,
   and the cheapest to reason about: no hand, no discard economy, just "here is a
   card, where does it go". If the core loop is good, it is good here.
2. **Cribbage on a blank board.** Same lift, and the opening placement genuinely
   matters — blank boards turn out to be *more* constrained than anchored ones
   (min legal cells 5 against 10), because growth from an edge has fewer
   directions than growth from the centre.
3. **Hex Sprawl**, for the open-ended world you actually described. It has the
   widest honest skill separation and the structure fits the brief — branch out,
   loop back, build bigger. But its choice spread of 15.5 says the scoring needs
   work before the structure is worth committing to; the best-window rule
   currently makes most hexes near-dead.

**One experiment worth running next:** partial deferral. Deferred payout has the
highest planning signal in the entire run and the worst feedback; splitting the
payout (say 40% on placement, 60% on completion) is a single config change and
should keep most of the planning signal while giving every turn something.

**Set aside:**

- **Suit-sets-axis** — measured backwards, and the reason is structural.
- **Both-axes** — makes mult participation guaranteed rather than earned, which
  answers the PRD's second question by deleting it.
- **Free placement** — lowers the floor without raising the ceiling.
- **Lock-and-cash as currently tuned** — the mechanic is coherent and the UI
  works, but naive play strangles its own board (min legal cells 0). It needs
  either cheaper cashing or a smaller sealing footprint before it is playable.
- **Every poker-lens config knob.** Ten variants, no movement. The lens is the
  variable; the knobs are not.

---

## What the numbers cannot tell you

The probe measures decision *structure*. It does not measure fun, and three
things now need a human at the board:

1. **Does cribbage counting feel good, or is it arithmetic homework?** This is
   the biggest risk in the whole recommendation and no metric here touches it.
   Every strong result above rests on the cribbage lens.
2. **Is One-Card Draft's low choice spread "every move matters" or "nothing
   matters"?** Those are identical in the numbers and opposite in the hand.
3. **Does Hex Sprawl feel like the world you described?** Branching out and
   looping back is a feeling, not a statistic.

## Methodology, and two corrections

Runs play their full placement budget rather than stopping on a win; win rate is
derived afterwards, which is exact because score only accumulates.

Two bugs were found and fixed during the run. Both invalidated published numbers,
and both are recorded here because the corrected numbers are only trustworthy if
the corrections are visible:

1. **Runs used to stop on reaching the target.** A ruleset with a higher target
   therefore played more placements, scored more, and showed a mechanically wider
   skill gap that had nothing to do with its mechanics. Every cross-ruleset
   number published before this fix was void.
2. **The random-play baseline was order-dependent.** It walked the value-sorted
   move list on a fixed stride driven by a counter held in module state — so the
   counter carried from one ruleset to the next, and inserting a ruleset silently
   changed the baseline, and therefore the skill gap, of every ruleset below it.
   It is now uniform random legal play, seeded per run. Greedy and two-ply were
   never affected, so lookahead lift, mult participation, choice spread and min
   cells were never wrong; **skill gap is the only column that moved.**

Three conditions make a row unreadable, and the Metrics page flags them from each
ruleset's own config rather than a hand-maintained list: placements worth nothing
on their own (greedy has no gradient), no adjacency requirement (the move set
inflates the skill gap), and random play scoring zero (the ratio measures
nothing, and is shown as `—`).
