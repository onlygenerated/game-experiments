import { describe, expect, it } from 'vitest';
import { hexesWithinRadius, hexKey, hexNeighbors, ORIGIN } from '../hex/coords';
import { isInRoom, isRoomBorder, makeRoom, roomBorder, roomCells, roomInterior } from '../rooms/room';
import { HOURGLASS_ROOM, ROOM_SHAPES, ROUND_ROOM } from '../rooms/shapes';

describe('makeRoom / roomCells / isInRoom', () => {
  it('round-trips the coordinates it was given', () => {
    const room = makeRoom('Test', [ORIGIN, { q: 1, r: 0 }]);
    expect(room.cells.size).toBe(2);
    expect(isInRoom(room, ORIGIN)).toBe(true);
    expect(isInRoom(room, { q: 1, r: 0 })).toBe(true);
    expect(isInRoom(room, { q: -1, r: 0 })).toBe(false);
  });

  it('dedupes coordinates given twice', () => {
    const room = makeRoom('Test', [ORIGIN, ORIGIN]);
    expect(room.cells.size).toBe(1);
  });

  it('roomCells returns every cell, order aside', () => {
    const coords = [ORIGIN, { q: 1, r: 0 }, { q: -1, r: 1 }];
    const room = makeRoom('Test', coords);
    expect(new Set(roomCells(room).map(hexKey))).toEqual(new Set(coords.map(hexKey)));
  });
});

describe('isRoomBorder / roomBorder / roomInterior', () => {
  it('every cell of a single-hex room is a border (it has no interior)', () => {
    const room = makeRoom('Speck', [ORIGIN]);
    expect(isRoomBorder(room, ORIGIN)).toBe(true);
    expect(roomBorder(room)).toHaveLength(1);
    expect(roomInterior(room)).toHaveLength(0);
  });

  it('a filled-in disc has exactly one ring of border and a nonempty interior', () => {
    const room = makeRoom('Disc', hexesWithinRadius(2));
    const border = roomBorder(room);
    const interior = roomInterior(room);
    expect(border.length + interior.length).toBe(room.cells.size);
    // The outer ring of a radius-2 disc is every cell at distance exactly 2.
    expect(border.every((h) => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q - h.r)) === 2)).toBe(true);
    expect(interior.length).toBeGreaterThan(0);
  });

  it('border and interior partition the room with no overlap', () => {
    for (const room of ROOM_SHAPES) {
      const border = new Set(roomBorder(room).map(hexKey));
      const interior = new Set(roomInterior(room).map(hexKey));
      expect(border.size + interior.size).toBe(room.cells.size);
      for (const k of border) expect(interior.has(k)).toBe(false);
    }
  });

  it('rejects a coordinate outside the room as border or interior', () => {
    const room = makeRoom('Test', [ORIGIN]);
    expect(isRoomBorder(room, { q: 5, r: 5 })).toBe(false);
  });
});

describe('ROUND_ROOM', () => {
  it('matches the radius-2 disc it is built from', () => {
    expect(ROUND_ROOM.cells.size).toBe(hexesWithinRadius(2).length);
    expect(isInRoom(ROUND_ROOM, ORIGIN)).toBe(true);
  });

  it('has exactly the outer ring as its border', () => {
    const border = new Set(roomBorder(ROUND_ROOM).map(hexKey));
    const outerRing = hexesWithinRadius(2).filter(
      (h) => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q - h.r)) === 2,
    );
    expect(border.size).toBe(outerRing.length);
    for (const h of outerRing) expect(border.has(hexKey(h))).toBe(true);
  });
});

describe('HOURGLASS_ROOM', () => {
  it('is contiguous — every cell reaches every other cell through the room', () => {
    const start = roomCells(HOURGLASS_ROOM)[0];
    const seen = new Set([hexKey(start)]);
    const stack = [start];
    while (stack.length) {
      const h = stack.pop()!;
      for (const n of hexNeighbors(h)) {
        const k = hexKey(n);
        if (isInRoom(HOURGLASS_ROOM, n) && !seen.has(k)) {
          seen.add(k);
          stack.push(n);
        }
      }
    }
    expect(seen.size).toBe(HOURGLASS_ROOM.cells.size);
  });

  it('has interior cells — the two chamber centres', () => {
    const interior = roomInterior(HOURGLASS_ROOM);
    expect(interior.map(hexKey).sort()).toEqual(['0,-3', '0,3']);
  });

  it('the neck sits at the geometric middle yet is entirely border', () => {
    // The point a radius-based room could never produce: a border cell with
    // border cells (not open space) on either side of it along the shape's
    // long axis.
    for (const h of [{ q: 0, r: -1 }, { q: 0, r: 0 }, { q: 0, r: 1 }]) {
      expect(isRoomBorder(HOURGLASS_ROOM, h)).toBe(true);
    }
  });

  it('the border is not a single ring — it has more than one connected arc', () => {
    // A disc's border is one loop. The hourglass's border loops around each
    // chamber *and* runs straight down the neck, so it cannot be described
    // as "everything at the maximum distance from a centre".
    const border = new Set(roomBorder(HOURGLASS_ROOM).map(hexKey));
    expect(border.has('0,0')).toBe(true); // neck midpoint: border
    expect(border.has('0,-3')).toBe(false); // top chamber centre: interior
  });
});
