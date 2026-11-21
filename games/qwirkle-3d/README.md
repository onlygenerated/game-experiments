# Qwirkle 3D

Qwirkle played in a cubic lattice. Same 108-piece set, same line rule — but the
pieces are cubes in a 3D space, so a placement joins up to **three** lines
instead of two.

Nothing is built yet. This file is the smallest thing needed to start building.

```bash
# not yet — no src/
```

## The rules

**The set.** 6 colours × 6 shapes × 3 copies = 108 cubes. Unchanged from
Qwirkle. Every face of a cube shows the same shape in the same colour, so a cube
is identifiable from any angle and orientation is never game state.

**The space.** An integer lattice, `(x, y, z)`, held as a sparse map keyed
`"x,y,z"`. Adjacency is **face adjacency** — the 6-neighbourhood. Cubes touching
along an edge or corner are not adjacent and form no line.

**Lines.** Three axes. A line is the maximal contiguous run of cubes through a
cell on one axis. A line is valid when its cubes either all share a colour and
have distinct shapes, or all share a shape and have distinct colours. No length
cap is needed — six distinct shapes means a valid line can't exceed 6.

**Legality.** An empty cell, face-adjacent to something already placed, where
**all three** lines through it are valid afterwards. That last constraint is the
game: a placement that builds a great X line and breaks the Z line it happens to
sit in is illegal.

**A turn.** Place one or more cubes — all on a single axis line, contiguous with
each other — then refill to a hand of 6. Or exchange cubes back into the bag,
forfeiting the turn.

**Scoring.** Every line of length ≥2 containing a new cube scores its length. A
line completed at 6 scores 6 + 6 = 12, a **Qwirkle**. A single cube can score up
to three lines; a cube completing all three is 36 points.

**Ending.** Bag empty and a hand empty: +6, game over. Or no legal placement
exists.

## The thing that might kill it

**An enclosed empty cell is a legal move you cannot click.** A cell with six
occupied neighbours is a perfectly legal target, invisible from every angle, and
unreachable with a pointer. There is no 2D analogue — this is the actual risk in
the idea, and it's a rendering and input problem, not a rules problem.

The plan is the voxel-editor answer: pick a **build plane** along the view axis
with a slider, render that layer as a flat clickable grid, cull what's in front
of it and dim what's behind. Plus a snapped camera (a free orbit finds angles
where two axes project to nearly the same screen direction and the board becomes
unreadable).

Build this early and badly, before anything else is polished. If a 3D board
can't be read fast enough to plan in, that is worth finding out in session one.

Likely fallback if it can't: play it as stacked 2D layers side by side, with the
3D view as confirmation rather than the primary surface. That's still a game —
just a different one, and worth naming honestly rather than pretending out of.

## MVP

One board, solo, hot-seat second. Playable means:

- 108 cubes, a hand of 6, place-and-refill
- the three-line legality check
- scoring with Qwirkles
- a build-plane view you can actually click any cell in, including a buried one
- a preview that names *which* line rejects an illegal target — in 2D you can
  see why a move is illegal, in 3D you can't

Not in the MVP: multi-cube turns, AI opponent, animation, exchange, camera
polish. Single-cube placement is enough to find out whether the space is
readable and whether three lines is interesting.

## Open questions

Real ones, to be answered by playing rather than by planning:

1. **Is the third axis a decision or just more points?** Scores will obviously
   go up. Whether the extra line makes placement *richer* is the whole bet.
2. **How big should the volume be?** Unbounded sprawls out of frame and can't be
   read. A 6×6×6 box is exactly the line cap, so a completed line has only one
   possible position and *where along the axis* stops being a choice. Starting
   at 8×8×8 as a guess; expect to change it after playing.
3. **Gravity?** Starting without it — cubes float, connection is adjacency
   alone. Gravity turns the bottom layer into a bottleneck and makes it a
   stacking game, which is a different experiment.

Keep the volume, hand size and bag distribution in one config file so the
answers to 2 and 3 are edits.
