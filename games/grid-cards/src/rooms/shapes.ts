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
 * Both rooms' thresholds (item 6) started as round-number placeholders (50)
 * and were replaced in item 22 with the room's own measured greedy median
 * over a full 12-placement budget (`tools/probe.test.ts`'s `room comparison`
 * table, `CONFIG`'s own poker counter, 20 seeds), the same method item 3 used
 * for every ruleset's `targetScore` — see item 22's decisions log for why 50
 * turned out to be off by more than an order of magnitude (a placeholder
 * threshold that a 3-placement opening already cleared, versus a real one
 * that needs most of the budget).
 *
 * The Round Room carries one `'marker'` tile (item 8) — a placeholder kind
 * that does nothing, kept to prove the tile layer renders and survives a
 * card landing on top of it — plus, as of item 9, one real `'cardMultiplier'`
 * tile: the Scrabble letter square, doubling whatever the card placed on it
 * contributes to each line it joins. Item 10 adds one `'lineMultiplier'`
 * tile: the word square, doubling a whole line's total rather than just the
 * placed card's share of it. Item 11 adds one `'blocked'` tile: rubble that
 * can never be placed on. Item 12 adds one `'trap'` tile at `(-2,1)` — off
 * on its own, not adjacent to any of the other tiles or to any cell the
 * smoke test's established placement sequence already lands on, so it stays
 * genuinely hidden until a placement deliberately lands on or beside it.
 * Item 13 adds one `'artifact'` tile at `(-1,2)` — a real card (`A♠`) sitting
 * on the board rather than dealt from the deck, placed well clear of every
 * other tile and of the smoke test's established six-placement sequence, so
 * it stays uncollected until a placement deliberately detours beside it. Its
 * `id` (`artifact-AS`) is deliberately not the same id `freshDeck` gives its
 * own ace of spades, so the two stay distinguishable if both ever end up in
 * the same deck or hand at once.
 *
 * Item 19 adds two further hand-authored rooms, `CRIBBAGE_VAULT_ROOM` and
 * `COMBO_BAZAAR_ROOM`, deliberately not appended to `ROOM_SHAPES` — that
 * array is the fixed sequence `RoomRunPage`'s default run and the smoke test
 * both drive, and this item is about a room being able to differ along three
 * axes (active counters, tile density, threshold), not about lengthening the
 * default run (item 21's room graph is where "which room comes next" becomes
 * a real question). Both are exported individually and via `ARCHETYPE_ROOMS`
 * so `RoomRunPage`'s new "Dev: load archetype rooms" control can drive them
 * the same way items 15-18's dev-pickup buttons stand in for mechanics with
 * no in-run acquisition path yet. Both thresholds were calibrated in item 22
 * the same way `ROUND_ROOM`/`HOURGLASS_ROOM`'s were — the room's own measured
 * greedy median, under its own `counters` where it sets one.
 */
import { hexesWithinRadius, type Hex } from '../hex/coords';
import { makeRoomGraph, type RoomGraph } from './graph';
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
  1027,
  [
    [{ q: 1, r: 0 }, { kind: 'marker', label: 'T8' }],
    [{ q: 0, r: -1 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: -1, r: -1 }, { kind: 'lineMultiplier', multiplier: 2 }],
    [{ q: 1, r: -1 }, { kind: 'blocked' }],
    [{ q: -2, r: 1 }, { kind: 'trap' }],
    [{ q: -1, r: 2 }, { kind: 'artifact', card: { id: 'artifact-AS', rank: 14, suit: 'S' } }],
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
  967,
);

export const ROOM_SHAPES: readonly Room[] = [ROUND_ROOM, HOURGLASS_ROOM];

/**
 * A tight radius-1 vault (7 cells — the smallest room shape in the game) with
 * one sparse `cardMultiplier` tile (1/7 cells, ~14% density) and its own
 * counters: cribbage alone, rather than whatever the run's own `Config`
 * carries. Where the Round Room demonstrates the substrate, this demonstrates
 * that a room's *identity* can be its counter — small, cribbage-only, and
 * (deliberately) sparse, the opposite end of the density axis from
 * `COMBO_BAZAAR_ROOM` below.
 */
export const CRIBBAGE_VAULT_ROOM: Room = makeRoom(
  'Cribbage Vault',
  hexesWithinRadius(1),
  [
    { q: 1, r: 0 },
    { q: -1, r: 0 },
  ],
  166,
  [[{ q: 0, r: -1 }, { kind: 'cardMultiplier', multiplier: 2 }]],
  { lensId: 'cribbage', secondLensId: '' },
);

/**
 * The same 19-cell disc `ROUND_ROOM` uses, but nearly half its cells (9/19,
 * ~47% density against the Round Room's own ~32%) carry a multiplier tile,
 * and its counters are the combo — cribbage *and* poker at once, item 2's
 * `combineLenses` machinery, summing both on every scored line — rather than
 * a single counter. Tiles avoid both exits so reach is never blocked by a
 * tile placement choice.
 */
export const COMBO_BAZAAR_ROOM: Room = makeRoom(
  'Combo Bazaar',
  hexesWithinRadius(2),
  [
    { q: 2, r: 0 },
    { q: -2, r: 0 },
  ],
  1731,
  [
    [{ q: -1, r: -1 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: 0, r: -2 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: 0, r: 0 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: 1, r: 1 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: 2, r: -2 }, { kind: 'cardMultiplier', multiplier: 2 }],
    [{ q: -1, r: 1 }, { kind: 'lineMultiplier', multiplier: 2 }],
    [{ q: 0, r: 2 }, { kind: 'lineMultiplier', multiplier: 2 }],
    [{ q: 1, r: -2 }, { kind: 'lineMultiplier', multiplier: 2 }],
    [{ q: -2, r: 2 }, { kind: 'lineMultiplier', multiplier: 2 }],
  ],
  { lensId: 'cribbage', secondLensId: 'poker' },
);

/** Item 19's two counter/density/threshold archetypes, kept out of the
 * default `ROOM_SHAPES` sequence — see the file header for why. */
export const ARCHETYPE_ROOMS: readonly Room[] = [CRIBBAGE_VAULT_ROOM, COMBO_BAZAAR_ROOM];

/**
 * Item 21: the room graph `RoomRunPage`'s default run actually plays now —
 * `ROOM_SHAPES` above stays exactly as it was (unchanged, still exported,
 * still what `generate.test.ts`'s own fixture-preservation check counts on)
 * since a graph-less two-room list is still a real, useful thing to have,
 * not something this item replaces.
 *
 * Round Room's two exits now lead somewhere genuinely different from each
 * other. Its east doorway — the one every pre-item-21 smoke sequence and
 * test already reaches — still leads to the Hourglass, preserving that
 * entire established path unchanged. Its west doorway, never exercised by
 * any existing test, now leads to the Cribbage Vault instead of nowhere —
 * reusing item 19's own archetype room rather than authoring a third fresh
 * shape, since this item is about routing, not new content, and a room that
 * scores under its own cribbage-only counters (unlike the Hourglass, which
 * has none and falls back to the run's own `Config`) makes the two branches
 * visibly different once you're inside them, not just differently named.
 * Both destinations are leaves — no outgoing routes of their own — so
 * leaving through either one completes the expedition, the same "ran off
 * the end" case a flat list's last room always was.
 */
export const DEFAULT_ROOM_LIST: readonly Room[] = [ROUND_ROOM, HOURGLASS_ROOM, CRIBBAGE_VAULT_ROOM];
export const DEFAULT_ROOM_GRAPH: RoomGraph = makeRoomGraph(DEFAULT_ROOM_LIST, [
  { from: 0, exit: { q: 2, r: 0 }, to: 1 },
  { from: 0, exit: { q: -2, r: 0 }, to: 2 },
]);
