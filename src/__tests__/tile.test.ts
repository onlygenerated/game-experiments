import { describe, expect, it } from 'vitest';
import { ORIGIN } from '../hex/coords';
import { makeRoom } from '../rooms/room';
import { emptyTileMap, isTiled, tileAt, tileMapFrom, withTile } from '../rooms/tile';

describe('emptyTileMap / withTile / tileAt / isTiled', () => {
  it('starts empty', () => {
    const tiles = emptyTileMap();
    expect(tiles.size).toBe(0);
    expect(isTiled(tiles, ORIGIN)).toBe(false);
    expect(tileAt(tiles, ORIGIN)).toBeUndefined();
  });

  it('withTile adds a tile without mutating the map it was given', () => {
    const before = emptyTileMap();
    const after = withTile(before, ORIGIN, { kind: 'marker', label: 'X' });
    expect(before.size).toBe(0);
    expect(after.size).toBe(1);
    expect(tileAt(after, ORIGIN)).toEqual({ kind: 'marker', label: 'X' });
    expect(isTiled(after, ORIGIN)).toBe(true);
  });

  it('a later withTile at the same cell replaces, not stacks', () => {
    const one = withTile(emptyTileMap(), ORIGIN, { kind: 'marker', label: 'A' });
    const two = withTile(one, ORIGIN, { kind: 'marker', label: 'B' });
    expect(two.size).toBe(1);
    expect(tileAt(two, ORIGIN)).toEqual({ kind: 'marker', label: 'B' });
  });

  it('tiles at different cells coexist independently', () => {
    const east = { q: 1, r: 0 };
    let tiles = withTile(emptyTileMap(), ORIGIN, { kind: 'marker', label: 'A' });
    tiles = withTile(tiles, east, { kind: 'marker', label: 'B' });
    expect(tileAt(tiles, ORIGIN)?.label).toBe('A');
    expect(tileAt(tiles, east)?.label).toBe('B');
    expect(isTiled(tiles, { q: -1, r: 0 })).toBe(false);
  });
});

describe('tileMapFrom', () => {
  it('builds a map from coordinate/tile pairs', () => {
    const east = { q: 1, r: 0 };
    const tiles = tileMapFrom([
      [ORIGIN, { kind: 'marker', label: 'A' }],
      [east, { kind: 'marker', label: 'B' }],
    ]);
    expect(tiles.size).toBe(2);
    expect(tileAt(tiles, ORIGIN)?.label).toBe('A');
    expect(tileAt(tiles, east)?.label).toBe('B');
  });

  it('an empty list of entries produces an empty map', () => {
    expect(tileMapFrom([]).size).toBe(0);
  });
});

describe('Room.tiles via makeRoom', () => {
  it('defaults to an empty tile map when no entries are given', () => {
    const room = makeRoom('Test', [ORIGIN]);
    expect(room.tiles.size).toBe(0);
  });

  it('carries the tiles it was given, keyed by hex', () => {
    const room = makeRoom('Test', [ORIGIN, { q: 1, r: 0 }], [], 0, [
      [ORIGIN, { kind: 'marker', label: 'A' }],
    ]);
    expect(room.tiles.size).toBe(1);
    expect(tileAt(room.tiles, ORIGIN)).toEqual({ kind: 'marker', label: 'A' });
    expect(isTiled(room.tiles, { q: 1, r: 0 })).toBe(false);
  });

  it('rejects a tile placed outside the room, the same way an exit outside the room is rejected', () => {
    expect(() =>
      makeRoom('Test', [ORIGIN], [], 0, [[{ q: 5, r: 5 }, { kind: 'marker', label: 'A' }]]),
    ).toThrow(/tile at 5,5 is not one of its cells/);
  });

  it('a tile can sit on an exit cell — a tile and a doorway are independent facts about a cell', () => {
    const room = makeRoom('Test', [ORIGIN, { q: 1, r: 0 }], [{ q: 1, r: 0 }], 0, [
      [{ q: 1, r: 0 }, { kind: 'marker', label: 'A' }],
    ]);
    expect(isTiled(room.tiles, { q: 1, r: 0 })).toBe(true);
  });
});
