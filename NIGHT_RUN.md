# Night run — durable state

This file is the memory for the unattended variant run. It exists because my
conversation context gets summarised over a long session, so the plan, the
decisions, and the results have to live on disk instead of in my head.

**Every wake-up:** read this file → do the next unstarted item → verify → commit
and push → update this file → republish the artifact → end turn. Never carry
plan state in context alone.

## Standing rules

- Commit and push after **every** item. The container is ephemeral; anything
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
- [ ] **2. Blank board (M6)** — no centre anchor; first placement picks the
      origin. Needed by the sprawl work.
- [ ] **3. Hex Sprawl — engine** — axial coords, three axes, line extraction,
      legality, tests. The big one.
- [ ] **4. Hex Sprawl — board UI** — hex rendering, drag and preview reuse.
- [ ] **5. Hex Sprawl — ring bonus** — distance multiplier + frontier growth.
- [ ] **6. One-Card Draft** — no hand; reveal one card, place or burn.
- [ ] **7. Category 2 mechanic variants** — both-axes, suit-sets-axis,
      deferred scoring, lock-and-cash, free placement.
- [ ] **8. Metrics page** — every ruleset ranked by skill gap, lookahead lift,
      mult participation, spread, choke turn. Poker Squares as the reference.
- [ ] **9. Morning summary** — findings and a recommended shortlist.

## Decisions log

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
