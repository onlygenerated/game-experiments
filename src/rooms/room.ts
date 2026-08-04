/**
 * A Room replaces "every hex within radius N" with an explicit shape: a set
 * of legal coordinates, plus whichever of them touch a cell outside the set.
 *
 * The distinction matters because a disc's border is always its single outer
 * ring, but an irregular shape can put a border cell at the geometric middle
 * (see `HOURGLASS_ROOM` in `shapes.ts`) — something "distance <= radius" can
 * never produce. Item 5 turns some border cells into exits; this item is
 * just the shape and the border, with nothing yet deciding which border
 * cells are exits.
 */
import { hexKey, hexNeighbors, parseHex, type Hex } from '../hex/coords';

export interface Room {
  name: string;
  /** Every legal coordinate in the room, hand-authored rather than derived from a radius. */
  cells: ReadonlySet<string>;
}

export function makeRoom(name: string, coords: readonly Hex[]): Room {
  return { name, cells: new Set(coords.map(hexKey)) };
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
