import { describe, expect, it } from 'vitest';
import type { Config } from '../config';
import { hexesWithinRadius, hexKey, hexNeighbors, ORIGIN } from '../hex/coords';
import {
  artifactCellsNear,
  isExit,
  isInRoom,
  isRoomBorder,
  makeRoom,
  roomBorder,
  roomCells,
  roomConfig,
  roomEndState,
  roomExits,
  roomInterior,
  roomTraps,
  structureReachedExits,
  structureReachesExit,
  tileDensity,
  trapCellsNear,
} from '../rooms/room';
import {
  COMBO_BAZAAR_ROOM,
  CRIBBAGE_VAULT_ROOM,
  HOURGLASS_ROOM,
  ROOM_SHAPES,
  ROUND_ROOM,
} from '../rooms/shapes';

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

describe('makeRoom exit validation', () => {
  it('accepts an exit that is a border cell', () => {
    const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    expect(isExit(room, { q: 1, r: 0 })).toBe(true);
  });

  it('rejects an exit outside the room entirely', () => {
    expect(() => makeRoom('Test', [ORIGIN], [{ q: 9, r: 9 }])).toThrow(/not one of its cells/);
  });

  it('rejects an exit that is an interior cell', () => {
    const disc = hexesWithinRadius(2);
    expect(() => makeRoom('Test', disc, [ORIGIN])).toThrow(/not a border cell/);
  });
});

describe('isExit / roomExits', () => {
  it('is false for a plain border cell that was never marked an exit', () => {
    const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    expect(isExit(room, { q: -1, r: 0 })).toBe(false);
    expect(isExit(room, { q: 1, r: 0 })).toBe(true);
  });

  it('is false for a coordinate outside the room', () => {
    const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    expect(isExit(room, { q: 9, r: 9 })).toBe(false);
  });

  it('roomExits round-trips exactly the coordinates given to makeRoom', () => {
    const exits = [{ q: 1, r: 0 }, { q: -1, r: 0 }];
    const room = makeRoom('Test', hexesWithinRadius(1), exits);
    expect(new Set(roomExits(room).map(hexKey))).toEqual(new Set(exits.map(hexKey)));
  });

  it('a room with no exits has an empty exit list', () => {
    const room = makeRoom('Test', hexesWithinRadius(1));
    expect(roomExits(room)).toHaveLength(0);
  });
});

describe('structureReachesExit', () => {
  const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }]);

  it('is false for an empty structure', () => {
    expect(structureReachesExit(room, new Set())).toBe(false);
  });

  it('is false when the structure touches the border but not at an exit', () => {
    // { q: -1, r: 0 } is a border cell of this room, same as the exit, but
    // it is not the one marked as an exit.
    const structure = new Set([hexKey(ORIGIN), hexKey({ q: -1, r: 0 })]);
    expect(structureReachesExit(room, structure)).toBe(false);
  });

  it('is true once the structure occupies the exit cell', () => {
    const structure = new Set([hexKey(ORIGIN), hexKey({ q: 1, r: 0 })]);
    expect(structureReachesExit(room, structure)).toBe(true);
  });

  it('is true for a lone placement directly on an exit, with nothing connected to it', () => {
    const structure = new Set([hexKey({ q: 1, r: 0 })]);
    expect(structureReachesExit(room, structure)).toBe(true);
  });

  it('does not credit an exit through a disconnected piece of the structure', () => {
    // Two separate one-cell blobs on a bigger room: one sits on the exit, the
    // other doesn't touch it. The disconnected non-exit blob must not affect
    // the answer either way, but the check must still be per-component, not
    // "is the exit anywhere in the structure" by coincidence of a shared set.
    const bigRoom = makeRoom('Big', hexesWithinRadius(3), [{ q: 3, r: 0 }]);
    const farFromExit = { q: -3, r: 0 };
    const onExit = { q: 3, r: 0 };
    const structure = new Set([hexKey(farFromExit), hexKey(onExit)]);
    expect(structureReachesExit(bigRoom, structure)).toBe(true);

    const onlyFarBlob = new Set([hexKey(farFromExit)]);
    expect(structureReachesExit(bigRoom, onlyFarBlob)).toBe(false);
  });

  it('credits reach through a connected chain leading up to the exit', () => {
    const bigRoom = makeRoom('Big', hexesWithinRadius(3), [{ q: 3, r: 0 }]);
    // A contiguous chain of hexes along the E axis from the origin to the exit.
    const chain = [ORIGIN, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
    expect(structureReachesExit(bigRoom, new Set(chain.map(hexKey)))).toBe(true);
    // Drop the last link before the exit: no longer connected to it.
    expect(structureReachesExit(bigRoom, new Set(chain.slice(0, 3).map(hexKey)))).toBe(false);
  });

  it('is false for a room with no exits regardless of what is occupied', () => {
    const noExitRoom = makeRoom('NoExits', hexesWithinRadius(1));
    const structure = new Set(hexesWithinRadius(1).map(hexKey));
    expect(structureReachesExit(noExitRoom, structure)).toBe(false);
  });
});

// Item 21: the room graph needs to know *which* exits a structure reaches,
// not just whether it reaches one at all, so route choice has something to
// choose between.
describe('structureReachedExits (item 21)', () => {
  const room = makeRoom('Test', hexesWithinRadius(2), [
    { q: 2, r: 0 },
    { q: -2, r: 0 },
  ]);

  it('is empty for an empty structure', () => {
    expect(structureReachedExits(room, new Set())).toEqual([]);
  });

  it('lists exactly the one exit a structure reaches', () => {
    const structure = new Set([hexKey(ORIGIN), hexKey({ q: 1, r: 0 }), hexKey({ q: 2, r: 0 })]);
    expect(structureReachedExits(room, structure).map(hexKey)).toEqual(['2,0']);
  });

  it('lists both exits when a single connected structure spans the room', () => {
    const chain = [
      { q: 2, r: 0 },
      { q: 1, r: 0 },
      ORIGIN,
      { q: -1, r: 0 },
      { q: -2, r: 0 },
    ];
    const reached = structureReachedExits(room, new Set(chain.map(hexKey))).map(hexKey);
    expect(reached.sort()).toEqual(['-2,0', '2,0']);
  });

  it('agrees with structureReachesExit on whether anything was reached', () => {
    const structure = new Set([hexKey({ q: 2, r: 0 })]);
    expect(structureReachedExits(room, structure).length > 0).toBe(structureReachesExit(room, structure));
  });
});

describe('ROUND_ROOM and HOURGLASS_ROOM exits', () => {
  it('ROUND_ROOM has two opposite exits on its outer ring', () => {
    expect(roomExits(ROUND_ROOM).map(hexKey).sort()).toEqual(['-2,0', '2,0']);
    for (const h of roomExits(ROUND_ROOM)) expect(isRoomBorder(ROUND_ROOM, h)).toBe(true);
  });

  it('HOURGLASS_ROOM has exits at the two chamber tips, not the neck', () => {
    expect(roomExits(HOURGLASS_ROOM).map(hexKey).sort()).toEqual(['0,-4', '0,4']);
  });

  it('a chain across the hourglass neck reaches the far exit', () => {
    const chain = [
      { q: 0, r: -4 },
      { q: 0, r: -3 },
      { q: 0, r: -2 },
      { q: 0, r: -1 },
      { q: 0, r: 0 },
      { q: 0, r: 1 },
      { q: 0, r: 2 },
      { q: 0, r: 3 },
      { q: 0, r: 4 },
    ];
    expect(structureReachesExit(HOURGLASS_ROOM, new Set(chain.map(hexKey)))).toBe(true);
  });

  it('a structure confined to one chamber does not reach the far exit', () => {
    const topChamberOnly = new Set(
      [{ q: 0, r: -4 }, { q: 1, r: -4 }, { q: -1, r: -3 }, { q: 0, r: -3 }].map(hexKey),
    );
    // Reaches its own chamber's exit (0,-4)...
    expect(structureReachesExit(HOURGLASS_ROOM, topChamberOnly)).toBe(true);
    // ...but not the far one, since only one exit is in this component either way —
    // check specifically that removing the near exit from the structure loses reach.
    const withoutNearExit = new Set([hexKey({ q: -1, r: -3 }), hexKey({ q: 0, r: -3 })]);
    expect(structureReachesExit(HOURGLASS_ROOM, withoutNearExit)).toBe(false);
  });
});

describe('makeRoom threshold default', () => {
  it('defaults to 0 when not given', () => {
    const room = makeRoom('Test', [ORIGIN]);
    expect(room.threshold).toBe(0);
  });

  it('carries the value given', () => {
    const room = makeRoom('Test', [ORIGIN], [], 200);
    expect(room.threshold).toBe(200);
  });
});

describe('roomEndState', () => {
  const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }], 100);
  const onExit = new Set([hexKey({ q: 1, r: 0 })]);
  const offExit = new Set([hexKey({ q: -1, r: 0 })]);

  it('is cleared only when both reach and score are met', () => {
    const end = roomEndState(room, onExit, 100);
    expect(end).toEqual({ reached: true, score: 100, threshold: 100, scoreMet: true, cleared: true });
  });

  it('reads as a near-miss — reached but short on score — rather than a flat loss', () => {
    const end = roomEndState(room, onExit, 40);
    expect(end.reached).toBe(true);
    expect(end.scoreMet).toBe(false);
    expect(end.cleared).toBe(false);
  });

  it('score alone, without reach, does not clear the room', () => {
    const end = roomEndState(room, offExit, 500);
    expect(end.reached).toBe(false);
    expect(end.scoreMet).toBe(true);
    expect(end.cleared).toBe(false);
  });

  it('neither condition met clears nothing', () => {
    const end = roomEndState(room, offExit, 0);
    expect(end.reached).toBe(false);
    expect(end.scoreMet).toBe(false);
    expect(end.cleared).toBe(false);
  });

  it('score exactly at the threshold counts as met', () => {
    expect(roomEndState(room, onExit, 99).scoreMet).toBe(false);
    expect(roomEndState(room, onExit, 100).scoreMet).toBe(true);
  });
});

describe('trapCellsNear (item 12)', () => {
  const trapCell = { q: 0, r: -1 };
  const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [
    [trapCell, { kind: 'trap' }],
  ]);

  it('finds a trap sitting directly on the queried cell', () => {
    expect(trapCellsNear(room, trapCell).map(hexKey)).toEqual([hexKey(trapCell)]);
  });

  it('finds a trap on a neighbouring cell — "beside", not only "on"', () => {
    expect(hexNeighbors(trapCell).map(hexKey)).toContain(hexKey(ORIGIN));
    expect(trapCellsNear(room, ORIGIN).map(hexKey)).toEqual([hexKey(trapCell)]);
  });

  it('finds nothing at a cell with no trap on or beside it', () => {
    expect(trapCellsNear(room, { q: 1, r: 0 }).length).toBe(0);
  });

  it('does not care whether the trap has already been sprung — that is expedition.ts state', () => {
    // Purely geometric: calling it twice for the same cell returns the same
    // answer, since this function has no notion of "already triggered".
    expect(trapCellsNear(room, trapCell)).toEqual(trapCellsNear(room, trapCell));
  });
});

describe('artifactCellsNear (item 13)', () => {
  const ACE_SPADES = { id: 'artifact-AS', rank: 14 as const, suit: 'S' as const };
  const artifactCell = { q: 0, r: -1 };
  const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [
    [artifactCell, { kind: 'artifact', card: ACE_SPADES }],
  ]);

  it('finds an artifact sitting directly on the queried cell', () => {
    expect(artifactCellsNear(room, artifactCell).map(hexKey)).toEqual([hexKey(artifactCell)]);
  });

  it('finds an artifact on a neighbouring cell — "beside", not only "on"', () => {
    expect(hexNeighbors(artifactCell).map(hexKey)).toContain(hexKey(ORIGIN));
    expect(artifactCellsNear(room, ORIGIN).map(hexKey)).toEqual([hexKey(artifactCell)]);
  });

  it('finds nothing at a cell with no artifact on or beside it', () => {
    expect(artifactCellsNear(room, { q: 1, r: 0 }).length).toBe(0);
  });

  it('does not care whether the artifact has already been collected — that is expedition.ts state', () => {
    expect(artifactCellsNear(room, artifactCell)).toEqual(artifactCellsNear(room, artifactCell));
  });
});

describe('roomTraps (item 16)', () => {
  it('finds every trap in the room, not just ones on or beside a given cell', () => {
    const trapCell = { q: 0, r: -1 };
    const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [[trapCell, { kind: 'trap' }]]);
    expect(roomTraps(room).map(hexKey)).toEqual([hexKey(trapCell)]);
  });

  it('returns an empty list for a room with no traps', () => {
    const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    expect(roomTraps(room)).toHaveLength(0);
  });

  it('finds ROUND_ROOM\'s one hand-authored trap', () => {
    expect(roomTraps(ROUND_ROOM).map(hexKey)).toEqual(['-2,1']);
  });

  it('is ignorant of sprung state — same answer called twice, no expedition to consult', () => {
    const trapCell = { q: 0, r: -1 };
    const room = makeRoom('Test', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [[trapCell, { kind: 'trap' }]]);
    expect(roomTraps(room)).toEqual(roomTraps(room));
  });
});

describe('makeRoom counters validation (item 19)', () => {
  it('accepts a known single lens id', () => {
    const room = makeRoom('Test', [ORIGIN], [], 0, [], { lensId: 'cribbage', secondLensId: '' });
    expect(room.counters).toEqual({ lensId: 'cribbage', secondLensId: '' });
  });

  it('accepts a known combo of two lens ids', () => {
    const room = makeRoom('Test', [ORIGIN], [], 0, [], { lensId: 'cribbage', secondLensId: 'poker' });
    expect(room.counters).toEqual({ lensId: 'cribbage', secondLensId: 'poker' });
  });

  it('throws on an unknown primary lens id', () => {
    expect(() => makeRoom('Test', [ORIGIN], [], 0, [], { lensId: 'nonsense', secondLensId: '' })).toThrow();
  });

  it('throws on an unknown second lens id', () => {
    expect(() =>
      makeRoom('Test', [ORIGIN], [], 0, [], { lensId: 'cribbage', secondLensId: 'nonsense' }),
    ).toThrow();
  });

  it('leaves counters unset (not undefined-but-present in a way that matters) when not given', () => {
    const room = makeRoom('Test', [ORIGIN]);
    expect(room.counters).toBeUndefined();
  });
});

describe('roomConfig (item 19)', () => {
  const baseCfg = { lensId: 'poker', secondLensId: '', mechanics: { requireAdjacency: true } } as Config;

  it('returns the same cfg reference when the room sets no counters', () => {
    const room = makeRoom('Test', [ORIGIN]);
    expect(roomConfig(room, baseCfg)).toBe(baseCfg);
  });

  it("overrides lensId/secondLensId with the room's own when it sets counters", () => {
    const room = makeRoom('Test', [ORIGIN], [], 0, [], { lensId: 'cribbage', secondLensId: 'poker' });
    const cfg = roomConfig(room, baseCfg);
    expect(cfg.lensId).toBe('cribbage');
    expect(cfg.secondLensId).toBe('poker');
  });

  it('leaves every other cfg field untouched', () => {
    const room = makeRoom('Test', [ORIGIN], [], 0, [], { lensId: 'cribbage', secondLensId: '' });
    expect(roomConfig(room, baseCfg).mechanics).toBe(baseCfg.mechanics);
  });

  it("CRIBBAGE_VAULT_ROOM and COMBO_BAZAAR_ROOM each override the run's counters", () => {
    expect(roomConfig(CRIBBAGE_VAULT_ROOM, baseCfg)).toEqual({
      ...baseCfg,
      lensId: 'cribbage',
      secondLensId: '',
    });
    expect(roomConfig(COMBO_BAZAAR_ROOM, baseCfg)).toEqual({
      ...baseCfg,
      lensId: 'cribbage',
      secondLensId: 'poker',
    });
  });
});

describe('tileDensity (item 19)', () => {
  it('is 0 for a room with no tiles', () => {
    const room = makeRoom('Test', hexesWithinRadius(1));
    expect(tileDensity(room)).toBe(0);
  });

  it('is 1 when every cell carries a tile', () => {
    const room = makeRoom('Test', [ORIGIN, { q: 1, r: 0 }], [], 0, [
      [ORIGIN, { kind: 'marker', label: 'a' }],
      [{ q: 1, r: 0 }, { kind: 'marker', label: 'b' }],
    ]);
    expect(tileDensity(room)).toBe(1);
  });

  it('is the fraction of cells tiled for a partial room', () => {
    const room = makeRoom('Test', [ORIGIN, { q: 1, r: 0 }, { q: -1, r: 0 }], [], 0, [
      [ORIGIN, { kind: 'marker', label: 'a' }],
    ]);
    expect(tileDensity(room)).toBeCloseTo(1 / 3);
  });

  it("CRIBBAGE_VAULT_ROOM is sparser than COMBO_BAZAAR_ROOM — the density axis the two archetypes demonstrate", () => {
    expect(tileDensity(CRIBBAGE_VAULT_ROOM)).toBeLessThan(tileDensity(COMBO_BAZAAR_ROOM));
  });
});
