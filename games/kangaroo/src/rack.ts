/**
 * The whole Kangaroo domain: a tree of racks, each holding tiles in two
 * places — on the rack (where their left-to-right order spells a word) and in
 * the tray (removed, but never destroyed).
 *
 * Everything here is pure and serialisable, which is what lets undo be a
 * stack of whole-board snapshots rather than a diff engine. Nothing in this
 * file knows a dictionary, and nothing ever will: see KANGAROO.md.
 */

export type Tile = { id: string; letter: string };

export type Zone = 'rack' | 'tray';

export type Rack = {
  id: string;
  /** On the rack, left to right. This order *is* the word. */
  tiles: Tile[];
  /** Taken off the rack, still owned by it, still returnable. */
  tray: Tile[];
  children: Rack[];
  collapsed: boolean;
};

export type Board = { root: Rack | null };

/** Where a tile is going: a zone of a rack, and an index within it. */
export type Slot = { rackId: string; zone: Zone; index: number };

/* -------------------------------------------------------------------------
 * Ids
 *
 * Monotonic rather than random so a test can predict them, and so a
 * deserialised board can resume the sequence (see `absorbIds`) instead of
 * minting ids that collide with the ones it just loaded.
 * ---------------------------------------------------------------------- */

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/** Test-only: make id sequences reproducible across cases. */
export function resetIds(): void {
  counter = 0;
}

/** Resume the id sequence past everything already in `board`. */
function absorbIds(board: Board): void {
  let max = 0;
  const seen = (id: string) => {
    const n = Number(id.slice(1));
    if (Number.isFinite(n) && n > max) max = n;
  };
  const walk = (rack: Rack) => {
    seen(rack.id);
    for (const t of [...rack.tiles, ...rack.tray]) seen(t.id);
    rack.children.forEach(walk);
  };
  if (board.root) walk(board.root);
  counter = Math.max(counter, max);
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

/** Scrabble letter values. Pure decoration — never summed, never scored.
 *  They are here because a square with a number in the corner reads as a
 *  tile, and a square without one reads as a box. */
const VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

export function tileValue(letter: string): number {
  return VALUES[letter.toUpperCase()] ?? 0;
}

/** What a rack currently spells. Empty racks spell nothing, which is a state,
 *  not an error. */
export function word(rack: Rack): string {
  return rack.tiles.map((t) => t.letter).join('');
}

export const MIN_LETTERS = 2;
export const MAX_LETTERS = 15;

/** Letters only, uppercase. Anything else in the typed word is dropped rather
 *  than rejected, so a pasted "well-being" seeds WELLBEING instead of an error
 *  message. */
export function normalizeWord(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_LETTERS);
}

export function findRack(board: Board, rackId: string): Rack | null {
  const walk = (rack: Rack): Rack | null => {
    if (rack.id === rackId) return rack;
    for (const c of rack.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return board.root ? walk(board.root) : null;
}

/** Depth of every rack, keyed by id — the tree layout's indent, computed once
 *  instead of threaded through the render as a prop. */
export function rackDepths(board: Board): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (rack: Rack, depth: number) => {
    out.set(rack.id, depth);
    rack.children.forEach((c) => walk(c, depth + 1));
  };
  if (board.root) walk(board.root, 0);
  return out;
}

export function rackCount(board: Board): number {
  let n = 0;
  const walk = (rack: Rack) => {
    n += 1;
    rack.children.forEach(walk);
  };
  if (board.root) walk(board.root);
  return n;
}

/* -------------------------------------------------------------------------
 * Building
 * ---------------------------------------------------------------------- */

function makeRack(letters: string[]): Rack {
  return {
    id: nextId('r'),
    tiles: letters.map((letter) => ({ id: nextId('t'), letter })),
    tray: [],
    children: [],
    collapsed: false,
  };
}

export function emptyBoard(): Board {
  return { root: null };
}

/** Seed a tree from a typed word. Returns the unchanged board if the word is
 *  too short to hold anything. */
export function createRoot(input: string): Board {
  const letters = normalizeWord(input);
  if (letters.length < MIN_LETTERS) return emptyBoard();
  return { root: makeRack([...letters]) };
}

/* -------------------------------------------------------------------------
 * Mutations
 *
 * Each returns a new board and leaves the old one untouched, so the undo
 * stack can just keep references. `mapRack` rebuilds only the spine down to
 * the rack that changed.
 * ---------------------------------------------------------------------- */

function mapRack(rack: Rack, id: string, fn: (r: Rack) => Rack): Rack {
  if (rack.id === id) return fn(rack);
  let changed = false;
  const children = rack.children.map((c) => {
    const next = mapRack(c, id, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...rack, children } : rack;
}

function updateRack(board: Board, rackId: string, fn: (r: Rack) => Rack): Board {
  if (!board.root) return board;
  const root = mapRack(board.root, rackId, fn);
  return root === board.root ? board : { root };
}

/**
 * Move one tile within its own rack: reorder on the rack, out to the tray, or
 * back from it. Tiles never move *between* racks — a child's letters are the
 * ones it was born with, and that is the whole constraint the tool rests on.
 *
 * `index` is read against the zone with the tile already removed, which is
 * what a drag's insertion caret shows.
 */
export function moveTile(board: Board, rackId: string, tileId: string, to: Slot): Board {
  if (to.rackId !== rackId) return board;
  return updateRack(board, rackId, (rack) => {
    const tiles = [...rack.tiles];
    const tray = [...rack.tray];
    const from = tiles.findIndex((t) => t.id === tileId);
    const fromTray = tray.findIndex((t) => t.id === tileId);
    let tile: Tile;
    if (from >= 0) tile = tiles.splice(from, 1)[0];
    else if (fromTray >= 0) tile = tray.splice(fromTray, 1)[0];
    else return rack;

    const target = to.zone === 'rack' ? tiles : tray;
    const at = Math.max(0, Math.min(to.index, target.length));
    target.splice(at, 0, tile);
    return { ...rack, tiles, tray };
  });
}

/** Take a child from a rack: a snapshot of its on-rack tiles, fresh ids, empty
 *  tray. A snapshot rather than a live link, so rearranging the parent later
 *  cannot scramble work already done downstream. */
export function spawnChild(board: Board, parentId: string): Board {
  return updateRack(board, parentId, (rack) => ({
    ...rack,
    collapsed: false,
    children: [...rack.children, makeRack(rack.tiles.map((t) => t.letter))],
  }));
}

/** Remove a rack and everything below it. The root is not deletable — clearing
 *  the board is a separate, confirmed action. */
export function deleteRack(board: Board, rackId: string): Board {
  if (!board.root || board.root.id === rackId) return board;
  const prune = (rack: Rack): Rack => {
    const kept = rack.children.filter((c) => c.id !== rackId);
    const children = kept.map(prune);
    const same =
      kept.length === rack.children.length && children.every((c, i) => c === rack.children[i]);
    return same ? rack : { ...rack, children };
  };
  return { root: prune(board.root) };
}

export function toggleCollapse(board: Board, rackId: string): Board {
  return updateRack(board, rackId, (rack) => ({ ...rack, collapsed: !rack.collapsed }));
}

/** Randomise a rack's on-rack tiles. Breaking a fixation on one arrangement is
 *  most of what this tool is for. */
export function shuffleRack(board: Board, rackId: string, rand: () => number = Math.random): Board {
  return updateRack(board, rackId, (rack) => {
    const tiles = [...rack.tiles];
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return { ...rack, tiles };
  });
}

export function sortTray(board: Board, rackId: string): Board {
  return updateRack(board, rackId, (rack) => ({
    ...rack,
    tray: [...rack.tray].sort((a, b) => a.letter.localeCompare(b.letter)),
  }));
}

/** Send every on-rack tile to the tray, or bring the whole tray back. One
 *  button each, because both are common enough to be worth not dragging. */
export function clearRack(board: Board, rackId: string): Board {
  return updateRack(board, rackId, (rack) =>
    rack.tiles.length === 0 ? rack : { ...rack, tiles: [], tray: [...rack.tray, ...rack.tiles] },
  );
}

export function restoreTray(board: Board, rackId: string): Board {
  return updateRack(board, rackId, (rack) =>
    rack.tray.length === 0 ? rack : { ...rack, tiles: [...rack.tiles, ...rack.tray], tray: [] },
  );
}

/* -------------------------------------------------------------------------
 * Leaving the tool
 * ---------------------------------------------------------------------- */

/** The tree as an indented outline, for pasting into notes. */
export function toOutline(board: Board): string {
  if (!board.root) return '';
  const lines: string[] = [];
  const walk = (rack: Rack, depth: number) => {
    lines.push(`${'  '.repeat(depth)}${word(rack) || '—'}`);
    rack.children.forEach((c) => walk(c, depth + 1));
  };
  walk(board.root, 0);
  return lines.join('\n');
}

export function serialize(board: Board): string {
  return JSON.stringify(board);
}

/** Parse a saved board, resuming the id sequence past it. Returns null for
 *  anything that does not read back as a board, so a corrupt or stale save is
 *  a fresh start rather than a crash. */
export function deserialize(text: string): Board | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const root = (raw as { root?: unknown }).root;
  if (root === null || root === undefined) return emptyBoard();
  const parsed = parseRack(root);
  if (!parsed) return null;
  const board = { root: parsed };
  absorbIds(board);
  return board;
}

function parseTile(raw: unknown): Tile | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, letter } = raw as { id?: unknown; letter?: unknown };
  if (typeof id !== 'string' || typeof letter !== 'string' || letter.length !== 1) return null;
  return { id, letter };
}

function parseRack(raw: unknown): Rack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !Array.isArray(r.tiles) || !Array.isArray(r.tray)) return null;
  const tiles: Tile[] = [];
  for (const t of r.tiles) {
    const tile = parseTile(t);
    if (!tile) return null;
    tiles.push(tile);
  }
  const tray: Tile[] = [];
  for (const t of r.tray) {
    const tile = parseTile(t);
    if (!tile) return null;
    tray.push(tile);
  }
  const children: Rack[] = [];
  for (const c of Array.isArray(r.children) ? r.children : []) {
    const child = parseRack(c);
    if (!child) return null;
    children.push(child);
  }
  return { id: r.id, tiles, tray, children, collapsed: r.collapsed === true };
}
