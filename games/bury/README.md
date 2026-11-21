# Bury — prototype

Open `index.html` in a browser. No build step, no dependencies, no server. `npm run sim`
runs the balance simulator in `tools/bury-sim.mjs`.

Moved here from `bury.html` on the `claude/game-implementation-plan-a9kgo7` branch.

A round: you are dealt 9 cards, there are 7 positions worth 1–7 points, and the total value of
the cards you **play** may not exceed the pip cap. At any position you may **bury** a card
instead of playing it — you forfeit that position, but the buried card doesn't count against the
cap, and it is stored permanently with the line. When that line comes back as a ghost, the bury
surfaces as a note *before* you build against it.

Rounds 1–3 are against a bot, because the archive starts empty. From round 4 the opponent is one
of your own past lines.

## Mobile

Built mobile-first. The whole build screen fits without scrolling at every phone size measured —
518px of content on a 740px screen, 514px on a 320×568 iPhone SE:

| | 320×568 | 360×740 | 390×844 | 412×915 |
|---|---|---|---|---|
| Build screen height, note showing | 514px | 518px | 520px | 533px |

That matters more than it sounds. The PRD stakes the mechanic on the note being *"readable while
the player is still deciding"* — if nothing scrolls, the note is unmissable. Where content does
scroll (the debug panel), the note is sticky on the page rather than on its own wrapper, so it
stays pinned the whole time. No breakpoints and no media queries; every size is a `clamp()`
against the viewport. Interaction is tap-to-select then tap-to-place, which behaves identically
under a finger and a mouse — no drag path to maintain.

## What differs from the PRD

**Both sides can bury the same position.** The spec's two rules collide there — "a buried
position is automatically lost to the opponent," applied to both players at once. It resolves as
a tie, so `TIE_GOES_TO` governs every ambiguous case rather than two constants disagreeing.

**A ghost's buried position is an open position for you**, taken uncontested. This falls out of
the existing rules, but it means a surfaced note is tactically live and not just sentimental: it
tells you exactly where the ghost has a hole. Those positions are tinted green and labelled
`OPEN` during the build.

**The cheat log hides the meaning behind a button.** The note shows the bury; the annotation
appears only after you click *"What did I mean?"*. Shown inline it pre-empts the recall it exists
to measure — this way you try to remember first and then find out whether you were right. Still
off by default, still labelled a crutch.

**A cap-mode toggle** in the debug panel, and **synthetic seeded lines are labelled as such** so
their notes never claim "you buried this" for a bury you never made.

## What the simulator found

`node tools/bury-sim.mjs` plays tens of thousands of hands against a mixed ghost pool and reports
whether any strategy dominates. Three findings, in order of size:

**1. The tie rule is the biggest number in the game — bigger than the cap.** At `PIP_CAP=55`,
flipping ties from the ghost to the player moves the player's average from 9.6 to 15.5 of 28, and
round win rate from 22% to 56%. §8 lists ties-to-ghost as an arbitrary call "worth flipping if it
feels punishing." It is worth about 6 points of 28, and at the specced setting you lose roughly
three rounds in four. Worth deciding deliberately rather than discovering.

**2. My per-card cap proposal was wrong, and the simulator is why it isn't the default.** I
argued the flat cap stops binding at two buries, which is true — it binds 86% of hands at zero
buries but only 40% at two. But scaling the budget to cards played over-corrects hard: burying
becomes pure loss and never-bury wins by 7+ points of 28. The mode is still in the debug panel,
labelled as the over-correction it is. Your flat cap is the shipped default.

**3. The flat cap's real problem is smaller than I claimed, and tuning fixes it.** At 55, bury-two
beats never-bury by 1.6 points — mild dominance, not a broken game. At **60** all four strategies
land within 0.7 points of each other while the cap still binds 71% of hands at zero buries. If
line-building feels like sorting tonight, 60 is where the sim says to look.

```
PIP_CAP = 55 (flat, ties to ghost)          PIP_CAP = 60 (flat, ties to ghost)
  never bury        9.60 / 28                 never bury       10.56 / 28
  bury 1 (pos 1)   10.83 / 28                 bury 1 (pos 1)   11.23 / 28  ← best
  bury 2 (pos 1,2) 11.23 / 28  ← best         bury 2 (pos 1,2) 10.80 / 28
  spread 1.63 — mildly dominant               spread 0.68 — no dominant line
```

The sim answers "is there a dominant strategy," which is a precondition for the mechanic being
interesting, not evidence that it is. It plays fixed bury heuristics against a self-play pool and
ignores the thing the evening is actually for — whether reading your own note changes the line
you build. Nothing headless can answer that.

```bash
node tools/bury-sim.mjs                                   # default sweep
node tools/bury-sim.mjs --caps 55,60 --tie player --hands 20000
```

## Debug panel

Seed 20 synthetic lines · live `PIP_CAP` slider · cap mode · max buries · tie rule · reveal delay
· force a specific ghost · archive table · reset · cheat log toggle.

Forcing a ghost overrides the bot bootstrap, so notes are reachable from round 1.

## Not implemented, deliberately

Line mutation and note decay are stubbed at `mutateLine()`, which every archived line passes
through on its way to becoming a ghost. Out of scope per §1.
