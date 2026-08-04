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
 */
import { hexKey, hexNeighbors, parseHex, type Hex } from '../hex/coords';

export interface Room {
  name: string;
  /** Every legal coordinate in the room, hand-authored rather than derived from a radius. */
  cells: ReadonlySet<string>;
  /** Border cells marked as doorways. Always a subset of the room's border. */
  exits: ReadonlySet<string>;
}

export function makeRoom(name: string, coords: readonly Hex[], exits: readonly Hex[] = []): Room {
  const cells = new Set(coords.map(hexKey));
  const room: Room = { name, cells, exits: new Set() };

  for (const e of exits) {
    const k = hexKey(e);
    if (!cells.has(k)) throw new Error(`Room "${name}": exit ${k} is not one of its cells`);
    if (!isRoomBorder(room, e)) throw new Error(`Room "${name}": exit ${k} is not a border cell`);
  }

  return { ...room, exits: new Set(exits.map(hexKey)) };
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
