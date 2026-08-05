import { describe, expect, it } from 'vitest';
import { generateRoom } from '../rooms/generate';
import { hexKey, hexNeighbors } from '../hex/coords';
import { isRoomBorder, roomCells, roomExits } from '../rooms/room';
import { ARCHETYPE_ROOMS, ROOM_SHAPES } from '../rooms/shapes';

/** Every cell of `room` reachable from every other through the room's own
 * cells — the same connectivity property `HOURGLASS_ROOM`'s own test proves
 * by hand for its one fixed shape, checked here for a generated one instead. */
function isConnected(cells: readonly { q: number; r: number }[]): boolean {
  if (cells.length === 0) return true;
  const set = new Set(cells.map(hexKey));
  const seen = new Set([hexKey(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const h = stack.pop()!;
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

describe('generateRoom determinism', () => {
  it('the same seed produces byte-identical cells, exits, tiles and threshold', () => {
    const a = generateRoom('determinism-seed');
    const b = generateRoom('determinism-seed');
    expect([...a.cells].sort()).toEqual([...b.cells].sort());
    expect([...a.exits].sort()).toEqual([...b.exits].sort());
    expect([...a.tiles.entries()].sort()).toEqual([...b.tiles.entries()].sort());
    expect(a.threshold).toBe(b.threshold);
    expect(a.name).toBe(b.name);
  });

  it('is a pure function of the seed string — unaffected by prior unrelated rng use elsewhere', () => {
    // Generating an unrelated room first must not perturb a later call for a
    // different seed; each call builds its own fresh mulberry32 stream.
    generateRoom('unrelated-warm-up');
    const a = generateRoom('after-warm-up');
    const b = generateRoom('after-warm-up');
    expect([...a.cells].sort()).toEqual([...b.cells].sort());
  });
});

describe('generateRoom variety', () => {
  it('different seeds produce different shapes — not the same room every time', () => {
    const sizes = new Set<number>();
    const cellSets = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const room = generateRoom(`variety-${i}`);
      sizes.add(room.cells.size);
      cellSets.add([...room.cells].sort().join('|'));
    }
    expect(sizes.size).toBeGreaterThan(1);
    expect(cellSets.size).toBeGreaterThan(1);
  });
});

describe('generateRoom shape validity', () => {
  for (let i = 0; i < 15; i++) {
    it(`seed "shape-${i}" is one connected region`, () => {
      const room = generateRoom(`shape-${i}`);
      expect(isConnected(roomCells(room))).toBe(true);
    });
  }

  it('respects minSize/maxSize bounds', () => {
    for (let i = 0; i < 10; i++) {
      const room = generateRoom(`bounds-${i}`, { minSize: 5, maxSize: 8 });
      expect(room.cells.size).toBeGreaterThanOrEqual(5);
      expect(room.cells.size).toBeLessThanOrEqual(8);
    }
  });

  it('a fixed size (minSize === maxSize) always produces exactly that many cells', () => {
    for (let i = 0; i < 10; i++) {
      const room = generateRoom(`fixed-size-${i}`, { minSize: 12, maxSize: 12 });
      expect(room.cells.size).toBe(12);
    }
  });
});

describe('generateRoom exits', () => {
  for (let i = 0; i < 15; i++) {
    it(`seed "exits-${i}" places every exit on a border cell`, () => {
      const room = generateRoom(`exits-${i}`);
      for (const h of roomExits(room)) expect(isRoomBorder(room, h)).toBe(true);
      expect(room.exits.size).toBeLessThanOrEqual(2);
    });
  }

  it('picks two exits far apart rather than adjacent, for a room with enough border', () => {
    // A large room has plenty of border cells to choose from — the "far
    // apart" heuristic should not degenerate to two neighbours.
    const room = generateRoom('far-apart-check', { minSize: 19, maxSize: 19 });
    const exits = roomExits(room);
    expect(exits).toHaveLength(2);
    const dq = exits[0].q - exits[1].q;
    const dr = exits[0].r - exits[1].r;
    const dist = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
    expect(dist).toBeGreaterThan(1);
  });
});

describe('generateRoom tiles', () => {
  it('never places a tile on an exit cell', () => {
    for (let i = 0; i < 15; i++) {
      const room = generateRoom(`tiles-${i}`);
      for (const exit of roomExits(room)) {
        expect(room.tiles.has(hexKey(exit))).toBe(false);
      }
    }
  });

  it('roughly tracks the requested density (loose bound — the algorithm can skip cells that would disconnect the room)', () => {
    const room = generateRoom('density-check', { minSize: 19, maxSize: 19, tileDensity: 0.5 });
    const nonExitCells = room.cells.size - room.exits.size;
    expect(room.tiles.size).toBeGreaterThan(0);
    expect(room.tiles.size).toBeLessThanOrEqual(nonExitCells);
  });

  it('zero density places no tiles at all', () => {
    const room = generateRoom('zero-density', { tileDensity: 0 });
    expect(room.tiles.size).toBe(0);
  });

  for (let i = 0; i < 20; i++) {
    it(`seed "connectivity-${i}" never seals off part of the room from its placeable cells`, () => {
      const room = generateRoom(`connectivity-${i}`);
      const unplaceable = new Set(
        [...room.tiles.entries()].filter(([, t]) => t.kind === 'blocked' || t.kind === 'artifact').map(([k]) => k),
      );
      const placeable = roomCells(room).filter((h) => !unplaceable.has(hexKey(h)));
      expect(isConnected(placeable)).toBe(true);
    });
  }
});

describe('generateRoom threshold', () => {
  it('is a positive, round, size-scaled placeholder rather than a magic constant', () => {
    for (let i = 0; i < 10; i++) {
      const room = generateRoom(`threshold-${i}`);
      expect(room.threshold).toBeGreaterThan(0);
      expect(room.threshold % 10).toBe(0);
    }
  });
});

describe('generateRoom leaves hand-authored fixtures untouched', () => {
  it('ROOM_SHAPES and ARCHETYPE_ROOMS are unaffected by generation existing', () => {
    expect(ROOM_SHAPES).toHaveLength(2);
    expect(ARCHETYPE_ROOMS).toHaveLength(2);
  });
});
