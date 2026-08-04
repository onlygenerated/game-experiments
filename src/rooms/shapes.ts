/**
 * Two hand-authored room shapes (backlog item 4's "data, not procedural" —
 * generation is item 20). Every coordinate here is a literal `{ q, r }`
 * except the round room, which freezes `hexesWithinRadius(2)` into a fixed
 * list rather than typing 19 pairs by hand; either way a `Room` only ever
 * sees a concrete cell set, never a radius.
 */
import { hexesWithinRadius, type Hex } from '../hex/coords';
import { makeRoom, type Room } from './room';

/** The disc the old "everything within radius N" sprawl used — the baseline
 * an irregular shape (below) is judged against: one outer ring, no interior
 * cell ever touches the outside. */
export const ROUND_ROOM: Room = makeRoom('Round Room', hexesWithinRadius(2));

/**
 * Two seven-hex chambers (a centre plus its six neighbours) joined by a
 * three-hex neck one cell wide. A radius can never produce this: the neck
 * sits at the shape's geometric middle, yet every neck cell touches the
 * outside, so the border is not a single outer ring the way the round
 * room's is — it dips into the interior.
 */
const HOURGLASS_COORDS: Hex[] = [
  { q: 0, r: -4 }, { q: 1, r: -4 },
  { q: -1, r: -3 }, { q: 0, r: -3 }, { q: 1, r: -3 },
  { q: -1, r: -2 }, { q: 0, r: -2 },
  { q: 0, r: -1 },
  { q: 0, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: 2 }, { q: 1, r: 2 },
  { q: -1, r: 3 }, { q: 0, r: 3 }, { q: 1, r: 3 },
  { q: -1, r: 4 }, { q: 0, r: 4 },
];

export const HOURGLASS_ROOM: Room = makeRoom('Hourglass', HOURGLASS_COORDS);

export const ROOM_SHAPES: readonly Room[] = [ROUND_ROOM, HOURGLASS_ROOM];
