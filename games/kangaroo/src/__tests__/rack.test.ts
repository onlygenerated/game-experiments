import { describe, expect, it } from 'vitest';
import {
  clearRack,
  createRoot,
  deleteRack,
  deserialize,
  emptyBoard,
  findRack,
  moveTile,
  normalizeWord,
  rackCount,
  rackDepths,
  resetIds,
  restoreTray,
  serialize,
  shuffleRack,
  sortTray,
  spawnChild,
  tileValue,
  toggleCollapse,
  toOutline,
  word,
  type Board,
  type Rack,
} from '../rack';

/** Every tile in the tree, rack and tray alike. */
function allTiles(board: Board): { id: string; letter: string }[] {
  const out: { id: string; letter: string }[] = [];
  const walk = (rack: Rack) => {
    out.push(...rack.tiles, ...rack.tray);
    rack.children.forEach(walk);
  };
  if (board.root) walk(board.root);
  return out;
}

function letters(tiles: { letter: string }[]): string {
  return [...tiles.map((t) => t.letter)].sort().join('');
}

function rack(board: Board, id: string): Rack {
  const found = findRack(board, id);
  if (!found) throw new Error(`no rack ${id}`);
  return found;
}

/** The example the whole tool exists to serve: LAGER, minus G and R, into ALE. */
function lagerToAle(): { board: Board; rootId: string; childId: string } {
  let board = createRoot('lager');
  const rootId = board.root!.id;
  board = spawnChild(board, rootId);
  const childId = board.root!.children[0].id;
  const child = rack(board, childId);
  const byLetter = (l: string) => child.tiles.find((t) => t.letter === l)!.id;
  // Off to the tray, then A L E in that order on the rack.
  board = moveTile(board, childId, byLetter('G'), { rackId: childId, zone: 'tray', index: 0 });
  board = moveTile(board, childId, byLetter('R'), { rackId: childId, zone: 'tray', index: 1 });
  board = moveTile(board, childId, byLetter('A'), { rackId: childId, zone: 'rack', index: 0 });
  board = moveTile(board, childId, byLetter('L'), { rackId: childId, zone: 'rack', index: 1 });
  return { board, rootId, childId };
}

describe('seeding a root', () => {
  it('makes one tile per letter, in order', () => {
    const board = createRoot('lager');
    expect(word(board.root!)).toBe('LAGER');
    expect(board.root!.tiles).toHaveLength(5);
    expect(board.root!.tray).toEqual([]);
    expect(board.root!.children).toEqual([]);
  });

  it('strips non-letters and uppercases, rather than rejecting', () => {
    expect(normalizeWord('well-being!')).toBe('WELLBEING');
    expect(normalizeWord('  Lager  ')).toBe('LAGER');
    expect(word(createRoot('well-being').root!)).toBe('WELLBEING');
  });

  it('caps at 15 letters and refuses anything under 2', () => {
    expect(normalizeWord('a'.repeat(40))).toHaveLength(15);
    expect(createRoot('a').root).toBeNull();
    expect(createRoot('!!').root).toBeNull();
    expect(createRoot('at').root).not.toBeNull();
  });

  it('gives repeated letters independent tiles', () => {
    const board = createRoot('letter');
    const ids = new Set(board.root!.tiles.map((t) => t.id));
    expect(ids.size).toBe(6);
  });
});

describe('invariant 1: tiles are conserved', () => {
  it('holds across removal, return and reorder', () => {
    let board = createRoot('lager');
    const id = board.root!.id;
    const before = letters(rack(board, id).tiles);
    const g = rack(board, id).tiles.find((t) => t.letter === 'G')!.id;

    board = moveTile(board, id, g, { rackId: id, zone: 'tray', index: 0 });
    expect(word(rack(board, id))).toBe('LAER');
    expect(letters([...rack(board, id).tiles, ...rack(board, id).tray])).toBe(before);

    board = moveTile(board, id, g, { rackId: id, zone: 'rack', index: 2 });
    expect(word(rack(board, id))).toBe('LAGER');
    expect(rack(board, id).tray).toEqual([]);
  });

  it('holds for clear and restore', () => {
    let board = createRoot('lager');
    const id = board.root!.id;
    board = clearRack(board, id);
    expect(rack(board, id).tiles).toEqual([]);
    expect(letters(rack(board, id).tray)).toBe('AEGLR');
    board = restoreTray(board, id);
    expect(word(rack(board, id))).toBe('LAGER');
  });

  it('holds under a shuffle — the same letters, reordered', () => {
    let board = createRoot('lager');
    const id = board.root!.id;
    board = shuffleRack(board, id, () => 0.5);
    expect(letters(rack(board, id).tiles)).toBe('AEGLR');
    expect(rack(board, id).tiles).toHaveLength(5);
  });

  it('refuses to move a tile into another rack', () => {
    const { board, rootId, childId } = lagerToAle();
    const tile = rack(board, rootId).tiles[0].id;
    const moved = moveTile(board, rootId, tile, { rackId: childId, zone: 'rack', index: 0 });
    expect(moved).toBe(board);
    expect(word(rack(board, rootId))).toBe('LAGER');
  });

  it('ignores a tile that is not in the rack it was asked for', () => {
    const board = createRoot('lager');
    const id = board.root!.id;
    expect(moveTile(board, id, 'nope', { rackId: id, zone: 'tray', index: 0 })).toBe(board);
  });

  it('clamps an out-of-range index instead of leaving a hole', () => {
    let board = createRoot('lager');
    const id = board.root!.id;
    const l = rack(board, id).tiles[0].id;
    board = moveTile(board, id, l, { rackId: id, zone: 'rack', index: 99 });
    expect(word(rack(board, id))).toBe('AGERL');
    board = moveTile(board, id, l, { rackId: id, zone: 'rack', index: -3 });
    expect(word(rack(board, id))).toBe('LAGER');
  });
});

describe('invariant 2: a child is born with its parent’s on-rack letters', () => {
  it('copies the rack, not the tray, by value with fresh ids', () => {
    let board = createRoot('lager');
    const rootId = board.root!.id;
    const g = board.root!.tiles.find((t) => t.letter === 'G')!.id;
    board = moveTile(board, rootId, g, { rackId: rootId, zone: 'tray', index: 0 });
    board = spawnChild(board, rootId);

    const child = board.root!.children[0];
    expect(word(child)).toBe('LAER');
    expect(child.tray).toEqual([]);
    const parentIds = new Set(board.root!.tiles.map((t) => t.id));
    expect(child.tiles.every((t) => !parentIds.has(t.id))).toBe(true);
  });

  it('is a snapshot — editing the parent afterwards leaves the child alone', () => {
    const { board, rootId, childId } = lagerToAle();
    const l = rack(board, rootId).tiles.find((t) => t.letter === 'L')!.id;
    const after = moveTile(board, rootId, l, { rackId: rootId, zone: 'tray', index: 0 });
    expect(word(rack(after, rootId))).toBe('AGER');
    expect(word(rack(after, childId))).toBe('ALE');
  });

  it('spawning again on the same parent makes a sibling', () => {
    const { board, rootId } = lagerToAle();
    const next = spawnChild(board, rootId);
    expect(rack(next, rootId).children).toHaveLength(2);
    expect(word(rack(next, rootId).children[1])).toBe('LAGER');
  });

  it('a grandchild inherits from the child, not the root', () => {
    const { board, childId } = lagerToAle();
    const next = spawnChild(board, childId);
    const grandchild = rack(next, childId).children[0];
    expect(word(grandchild)).toBe('ALE');
    expect(rackDepths(next).get(grandchild.id)).toBe(2);
  });

  it('expands a collapsed parent, so a new child is never born hidden', () => {
    let board = createRoot('lager');
    const id = board.root!.id;
    board = toggleCollapse(board, id);
    expect(rack(board, id).collapsed).toBe(true);
    board = spawnChild(board, id);
    expect(rack(board, id).collapsed).toBe(false);
  });
});

describe('invariant 3: every tile and rack id is unique', () => {
  it('holds across a tree of spawns', () => {
    let board = createRoot('lager');
    const rootId = board.root!.id;
    board = spawnChild(board, rootId);
    board = spawnChild(board, rootId);
    board = spawnChild(board, board.root!.children[0].id);

    const tileIds = allTiles(board).map((t) => t.id);
    expect(new Set(tileIds).size).toBe(tileIds.length);
    expect(rackCount(board)).toBe(4);
  });

  it('does not reuse ids after a reload', () => {
    resetIds();
    let board = createRoot('lager');
    const reloaded = deserialize(serialize(board))!;
    board = spawnChild(reloaded, reloaded.root!.id);
    const tileIds = allTiles(board).map((t) => t.id);
    expect(new Set(tileIds).size).toBe(tileIds.length);
  });
});

describe('invariant 4: serialise → deserialise is identity', () => {
  it('round-trips a real tree', () => {
    const { board } = lagerToAle();
    const back = deserialize(serialize(board));
    expect(back).toEqual(board);
  });

  it('round-trips the empty board', () => {
    expect(deserialize(serialize(emptyBoard()))).toEqual(emptyBoard());
  });

  it('rejects corrupt or foreign saves instead of crashing', () => {
    expect(deserialize('{')).toBeNull();
    expect(deserialize('42')).toBeNull();
    expect(deserialize('{"root":{"id":"r1"}}')).toBeNull();
    expect(deserialize('{"root":{"id":"r1","tiles":[{"id":"t1"}],"tray":[]}}')).toBeNull();
  });
});

describe('pruning', () => {
  it('deletes a rack and its whole subtree', () => {
    let board = createRoot('lager');
    const rootId = board.root!.id;
    board = spawnChild(board, rootId);
    const childId = board.root!.children[0].id;
    board = spawnChild(board, childId);
    board = spawnChild(board, rootId);
    expect(rackCount(board)).toBe(4);

    board = deleteRack(board, childId);
    expect(rackCount(board)).toBe(2);
    expect(findRack(board, childId)).toBeNull();
  });

  it('never deletes the root', () => {
    const board = createRoot('lager');
    expect(deleteRack(board, board.root!.id)).toBe(board);
  });
});

describe('leaving the tool', () => {
  it('exports an indented outline', () => {
    let { board, childId } = lagerToAle();
    board = spawnChild(board, childId);
    expect(toOutline(board)).toBe('LAGER\n  ALE\n    ALE');
  });

  it('marks an empty rack rather than emitting a blank line', () => {
    let board = createRoot('lager');
    board = clearRack(board, board.root!.id);
    expect(toOutline(board)).toBe('—');
    expect(toOutline(emptyBoard())).toBe('');
  });

  it('sorts a tray alphabetically', () => {
    const { board, childId } = lagerToAle();
    const sorted = sortTray(board, childId);
    expect(letters(rack(sorted, childId).tray)).toBe('GR');
    expect(rack(sorted, childId).tray.map((t) => t.letter)).toEqual(['G', 'R']);
  });
});

describe('tile values', () => {
  it('are the Scrabble ones, and never crash on a letter it has no value for', () => {
    expect(tileValue('A')).toBe(1);
    expect(tileValue('Q')).toBe(10);
    expect(tileValue('?')).toBe(0);
  });
});
