/**
 * Two hand-authored room shapes (backlog item 4's "data, not procedural" —
 * generation is item 20). Every coordinate here is a literal `{ q, r }`
 * except the round room, which freezes `hexesWithinRadius(2)` into a fixed
 * list rather than typing 19 pairs by hand; either way a `Room` only ever
 * sees a concrete cell set, never a radius.
 *
 * Each room also hand-picks its exits (item 5) — opposite doorways rather
 * than one, so reaching "an" exit is a real choice of direction and not a
 * single forced target.
 *
 * Both rooms' thresholds (item 6) are round-number placeholders, not
 * calibration — no room has an engine wired to it yet to measure a real
 * score distribution against (item 7), and thresholds get set from probed
 * medians in item 22, per the standing "never tune a room by eye" rule.
 *
 * The Round Room carries one `'marker'` tile (item 8) — a placeholder kind
 * that does nothing, kept to prove the tile layer renders and survives a
 * card landing on top of it — plus, as of item 9, one real `'cardMultiplier'`
 * tile: the Scrabble letter square, doubling whatever the card placed on it
 * contributes to each line it joins. Item 10 adds one `'lineMultiplier'`
 * tile: the word square, doubling a whole line's total rather than just the
 * placed card's share of it. Item 11 adds one `'blocked'` tile: rubble that
 * can never be placed on. Trap/artifact tiles (items 12-13) still have
 * nothing here yet.
 */
import { hexesWithinRadius, type Hex } from '../hex/coords';
import { makeRoom, type Room } from './room';

/** The disc the old "everything within radius N" sprawl used — the baseline
 * an irregular shape (below) is judged against: one outer ring, no interior
 * cell ever touches the outside. Exits sit at due east and due west on that
 * ring — opposite doorways across the disc. */
export const ROUND_ROOM: Room = makeRoom(
  'Round Room',
  hexesWithinRadius(2),
  [
    { q: 2, r: 0 },
    { q: -2, r: 0 },
  ],
  50,
  [
    [{ q: 1, r: 0 }, { kind: 'marker', label: 'T8' }],
    [{ q: 0, r: -1 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: -1, r: -1 }, { kind: 'lineMultiplier', multiplier: 2 }],
    [{ q: 1, r: -1 }, { kind: 'blocked' }],
  ],
);

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

/** The two tips, straight through the neck from each other — the far end of
 * each chamber, opposite the doorway a structure would have to cross the
 * neck to reach from the other side. */
export const HOURGLASS_ROOM: Room = makeRoom(
  'Hourglass',
  HOURGLASS_COORDS,
  [
    { q: 0, r: -4 },
    { q: 0, r: 4 },
  ],
  50,
);

export const ROOM_SHAPES: readonly Room[] = [ROUND_ROOM, HOURGLASS_ROOM];
