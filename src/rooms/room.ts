/**
 * A Room replaces "every hex within radius N" with an explicit shape: a set
 * of legal coordinates, plus whichever of them touch a cell outside the set.
 *
 * The distinction matters because a disc's border is always its single outer
 * ring, but an irregular shape can put a border cell at the geometric middle
 * (see `HOURGLASS_ROOM` in `shapes.ts`) — something "distance <= radius" can
 * never produce.
 *
 * Item 5 turns some border cells into exits. An exit is an ordinary room
 * cell (still placeable — there is no tile layer yet, that's item 8) with
 * one extra fact attached: it is one of the doorways the room's reach
 * condition cares about. "Touch" is occupancy — placing a card on an exit
 * hex is what reaching it means, the same way any other hex is claimed by
 * being played on. `structureReachesExit` still walks the structure's
 * connectivity (not a bare set-membership test) because a structure need
 * not be one contiguous blob (free placement, item 17's alternate origins);
 * reach only credits whichever connected piece actually contains an exit.
 *
 * Item 6 adds the other half of clearing a room: a score `threshold`, and
 * `roomEndState` which reports reach and score as two separate booleans
 * rather than collapsing them into one pass/fail, so a structure that
 * reached the exit but fell short on score reads as "you got there but
 * were short" and not just "lost". Both hand-authored rooms' thresholds
 * (see `shapes.ts`) are undocumented placeholders — there is no engine
 * wired to a room yet (that's item 7) to probe a real score distribution
 * against, and the standing rule is not to tune a room by eye. Item 22's
 * calibration pass is where these become real numbers.
 *
 * Item 8 adds `tiles`, a `TileMap` (see `tile.ts`) alongside `cells`/`exits` —
 * a room's tile layout is part of its hand-authored shape, the same way its
 * exits are, not something that changes as cards get placed on top of it.
 *
 * Item 12 adds `trapCellsNear`, a pure geometry query for the trap tile
 * kind: which trap cells, if any, sit at a given hex or one of its six
 * neighbours ("on or beside", per the backlog item's own wording). It says
 * nothing about whether those traps have already sprung — that is
 * `expedition.ts`'s job (see `tile.ts`'s note on why reveal state lives
 * there, not on `Room`).
 */
import { hexKey, hexNeighbors, parseHex, type Hex } from '../hex/coords';
import { emptyTileMap, tileAt, tileMapFrom, type Tile, type TileMap } from './tile';

export interface Room {
  name: string;
  /** Every legal coordinate in the room, hand-authored rather than derived from a radius. */
  cells: ReadonlySet<string>;
  /** Border cells marked as doorways. Always a subset of the room's border. */
  exits: ReadonlySet<string>;
  /** Score a structure must reach, in addition to reaching an exit, to clear the room. */
  threshold: number;
  /** Tiles the room's cells sit on. No effects read this yet — see `tile.ts`. */
  tiles: TileMap;
}

export function makeRoom(
  name: string,
  coords: readonly Hex[],
  exits: readonly Hex[] = [],
  threshold = 0,
  tileEntries: readonly (readonly [Hex, Tile])[] = [],
): Room {
  const cells = new Set(coords.map(hexKey));
  const room: Room = { name, cells, exits: new Set(), threshold, tiles: emptyTileMap() };

  for (const e of exits) {
    const k = hexKey(e);
    if (!cells.has(k)) throw new Error(`Room "${name}": exit ${k} is not one of its cells`);
    if (!isRoomBorder(room, e)) throw new Error(`Room "${name}": exit ${k} is not a border cell`);
  }

  for (const [h] of tileEntries) {
    if (!cells.has(hexKey(h))) {
      throw new Error(`Room "${name}": tile at ${hexKey(h)} is not one of its cells`);
    }
  }

  return { ...room, exits: new Set(exits.map(hexKey)), tiles: tileMapFrom(tileEntries) };
}

export function roomCells(room: Room): Hex[] {
  return [...room.cells].map(parseHex);
}

export const isInRoom = (room: Room, h: Hex): boolean => room.cells.has(hexKey(h));

/** True if `h` is in the room and at least one of its neighbours is not. */
export const isRoomBorder = (room: Room, h: Hex): boolean =>
  isInRoom(room, h) && hexNeighbors(h).some((n) => !isInRoom(room, n));

/** Every cell inside the room that touches a cell outside it. */
export function roomBorder(room: Room): Hex[] {
  return roomCells(room).filter((h) => isRoomBorder(room, h));
}

/** Cells inside the room with all six neighbours also inside it. */
export function roomInterior(room: Room): Hex[] {
  return roomCells(room).filter((h) => !isRoomBorder(room, h));
}

export const isExit = (room: Room, h: Hex): boolean => room.exits.has(hexKey(h));

export function roomExits(room: Room): Hex[] {
  return [...room.exits].map(parseHex);
}

/**
 * Every `'trap'`-tile cell at `h` itself or one of its six neighbours —
 * "on or beside" a trap, item 12's own phrasing. Purely geometric: whether
 * a returned trap has already fired this expedition is not this function's
 * concern (see the header comment).
 */
export function trapCellsNear(room: Room, h: Hex): Hex[] {
  return [h, ...hexNeighbors(h)].filter((c) => tileAt(room.tiles, c)?.kind === 'trap');
}

/**
 * True if some connected piece of the placed structure — cells occupied by a
 * card, linked to each other by hex adjacency — includes an exit. Walking
 * connectivity rather than testing set membership directly matters once a
 * structure can be more than one blob: an isolated stray placement
 * elsewhere on the board must not be credited just because *some* cell
 * somewhere is occupied, and a piece that reaches an exit must not be
 * penalised for a separate, disconnected piece existing.
 *
 * `structure` is a set of hex keys, the same shape `HexBoard` keys already
 * use — this stays independent of `HexBoard`/`Card` on purpose, since no
 * room has an engine wired to it yet (item 7).
 */
export function structureReachesExit(room: Room, structure: ReadonlySet<string>): boolean {
  if (room.exits.size === 0) return false;

  const seen = new Set<string>();
  for (const startKey of structure) {
    if (seen.has(startKey)) continue;

    const stack = [startKey];
    seen.add(startKey);
    const component = [startKey];

    while (stack.length) {
      const k = stack.pop()!;
      for (const n of hexNeighbors(parseHex(k))) {
        const nk = hexKey(n);
        if (structure.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
          component.push(nk);
        }
      }
    }

    if (component.some((k) => room.exits.has(k))) return true;
  }

  return false;
}

/** Reach and score, reported separately, plus their conjunction. */
export interface RoomEndState {
  reached: boolean;
  score: number;
  threshold: number;
  scoreMet: boolean;
  /** True only when both conditions hold. */
  cleared: boolean;
}

/**
 * The room's end condition: reach an exit *and* meet the threshold, both
 * always (see the pre-declared decision in ROOMS.md). Returns the two
 * conditions separately rather than one boolean so a caller can render the
 * near-miss cases distinctly — reached but short, or clear of the score bar
 * but never made it to a door.
 */
export function roomEndState(
  room: Room,
  structure: ReadonlySet<string>,
  score: number,
): RoomEndState {
  const reached = structureReachesExit(room, structure);
  const scoreMet = score >= room.threshold;
  return { reached, score, threshold: room.threshold, scoreMet, cleared: reached && scoreMet };
}
