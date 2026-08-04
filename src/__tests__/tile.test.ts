import { describe, expect, it } from 'vitest';
import { ORIGIN } from '../hex/coords';
import { makeRoom } from '../rooms/room';
import { emptyTileMap, isTiled, tileAt, tileBadge, tileMapFrom, withTile } from '../rooms/tile';

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
    expect(tileBadge(tileAt(tiles, ORIGIN)!)).toBe('A');
    expect(tileBadge(tileAt(tiles, east)!)).toBe('B');
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
    expect(tileBadge(tileAt(tiles, ORIGIN)!)).toBe('A');
    expect(tileBadge(tileAt(tiles, east)!)).toBe('B');
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

describe('cardMultiplier tiles (item 9)', () => {
  it('stores and retrieves a cardMultiplier tile like any other kind', () => {
    const tiles = withTile(emptyTileMap(), ORIGIN, { kind: 'cardMultiplier', multiplier: 2 });
    expect(tileAt(tiles, ORIGIN)).toEqual({ kind: 'cardMultiplier', multiplier: 2 });
  });

  it('badges as ×N, derived from the multiplier rather than a stored label', () => {
    expect(tileBadge({ kind: 'cardMultiplier', multiplier: 2 })).toBe('×2');
    expect(tileBadge({ kind: 'cardMultiplier', multiplier: 3 })).toBe('×3');
  });

  it('coexists with a marker tile at a different cell in the same room', () => {
    const east = { q: 1, r: 0 };
    const room = makeRoom('Test', [ORIGIN, east], [], 0, [
      [ORIGIN, { kind: 'marker', label: 'A' }],
      [east, { kind: 'cardMultiplier', multiplier: 2 }],
    ]);
    expect(tileAt(room.tiles, ORIGIN)?.kind).toBe('marker');
    expect(tileAt(room.tiles, east)?.kind).toBe('cardMultiplier');
  });
});

describe('lineMultiplier tiles (item 10)', () => {
  it('stores and retrieves a lineMultiplier tile like any other kind', () => {
    const tiles = withTile(emptyTileMap(), ORIGIN, { kind: 'lineMultiplier', multiplier: 2 });
    expect(tileAt(tiles, ORIGIN)).toEqual({ kind: 'lineMultiplier', multiplier: 2 });
  });

  it('badges as L×N, distinct from a cardMultiplier tile carrying the same number', () => {
    expect(tileBadge({ kind: 'lineMultiplier', multiplier: 2 })).toBe('L×2');
    expect(tileBadge({ kind: 'lineMultiplier', multiplier: 3 })).toBe('L×3');
    expect(tileBadge({ kind: 'lineMultiplier', multiplier: 2 })).not.toBe(
      tileBadge({ kind: 'cardMultiplier', multiplier: 2 }),
    );
  });

  it('coexists with a cardMultiplier tile at a different cell in the same room', () => {
    const east = { q: 1, r: 0 };
    const room = makeRoom('Test', [ORIGIN, east], [], 0, [
      [ORIGIN, { kind: 'cardMultiplier', multiplier: 2 }],
      [east, { kind: 'lineMultiplier', multiplier: 2 }],
    ]);
    expect(tileAt(room.tiles, ORIGIN)?.kind).toBe('cardMultiplier');
    expect(tileAt(room.tiles, east)?.kind).toBe('lineMultiplier');
  });
});
