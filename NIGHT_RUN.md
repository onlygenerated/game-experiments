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

- [ ] **1. Category 1 config variants** — the remaining 6 of 10 as data in
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

_Appended as they are taken._

## Results log

_Probe numbers per variant, appended as they are measured._

| variant | target | greedy | careless | skill gap | 2-ply lift | mult live | spread | win |
|---|---|---|---|---|---|---|---|---|
| poker-baseline | 300 | 336 | 310 | 1.08 | 1.07 | 13% | 5.1 | 100% |
| cribbage | 600 | 606 | 246 | 2.46 | 1.14 | 42% | 7.0 | 55% |
| cribbage-unbound | 1050 | 1032 | 207 | 4.99 | 1.18 | 27% | 15.0 | 45% |
| cribbage-pure | 450 | 456 | 84 | 5.43 | 1.17 | 15% | 24.0 | 60% |
