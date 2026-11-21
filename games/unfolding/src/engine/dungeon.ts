import { hashSeed, Rng } from './rng.ts';
import { BALANCE as B } from './balance.ts';
import { T_FLOOR, T_HEART, T_STAIRS, T_UP, T_WALL, type Element, type Floor, type Pos, type Rect } from './types.ts';

export const MAP_W = 48;
export const MAP_H = 28;

export const idx = (f: Pick<Floor, 'w'>, x: number, y: number) => y * f.w + x;

export function inBounds(f: Pick<Floor, 'w' | 'h'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < f.w && y < f.h;
}

export function passable(f: Floor, x: number, y: number): boolean {
  return inBounds(f, x, y) && f.tiles[idx(f, x, y)] !== T_WALL;
}

export const DIRS: Pos[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/** BFS step distance from `from` to every passable tile (8-way). -1 = unreachable. */
export function distanceMap(f: Floor, from: Pos): Int16Array {
  const dist = new Int16Array(f.w * f.h).fill(-1);
  const queue: number[] = [idx(f, from.x, from.y)];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % f.w;
    const y = (i - x) / f.w;
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!passable(f, nx, ny)) continue;
      const ni = idx(f, nx, ny);
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

const center = (r: Rect): Pos => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

function carveRoom(tiles: number[], r: Rect) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * MAP_W + x] = T_FLOOR;
}

function carveCorridor(tiles: number[], a: Pos, b: Pos, rng: Rng) {
  const horizFirst = rng.chance(0.5);
  const corner = horizFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  for (const [p, q] of [
    [a, corner],
    [corner, b],
  ] as const) {
    const dx = Math.sign(q.x - p.x);
    const dy = Math.sign(q.y - p.y);
    let x = p.x;
    let y = p.y;
    tiles[y * MAP_W + x] = T_FLOOR;
    while (x !== q.x || y !== q.y) {
      x += dx;
      y += dy;
      tiles[y * MAP_W + x] = T_FLOOR;
    }
  }
}

export interface LayoutOpts {
  /** Halls is active: the full floor. Otherwise just its largest room. */
  halls: boolean;
  /** The Sprawl variant of Halls: a few more rooms. */
  sprawl: boolean;
  /** Shape of Space is Caverns: open caves instead of rooms and corridors. */
  caverns?: boolean;
  /** The deepest floor of this Age: the way down is the Heart. */
  heart?: boolean;
}

/**
 * Floor geography is a function of the world seed, depth and the Halls rule
 * only, so every heir walks the same halls — and graves stay where their owners
 * fell. A single-room floor is the full floor's largest room, so when Halls
 * arrives mid-floor the room you're standing in is already part of it.
 */
export function generateLayout(worldSeed: number, depth: number, opts: LayoutOpts = { halls: true, sprawl: false }): Floor {
  const full = opts.caverns ? caveLayout(worldSeed, depth, opts.sprawl) : fullLayout(worldSeed, depth, opts.sprawl);
  const floor = opts.halls ? full : opts.caverns ? soloCave(full) : soloLayout(full);
  if (opts.heart) markHeart(floor);
  return floor;
}

/** The way down becomes the Heart. */
export function markHeart(f: Floor) {
  f.heart = true;
  f.tiles[idx(f, f.stairs.x, f.stairs.y)] = T_HEART;
}

/** The full floor's largest room (first on ties). */
export function soloRoom(full: Pick<Floor, 'rooms'>): Rect {
  return full.rooms.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best), full.rooms[0]);
}

function soloLayout(full: Floor): Floor {
  const room = soloRoom(full);
  const tiles = new Array<number>(MAP_W * MAP_H).fill(T_WALL);
  carveRoom(tiles, room);
  const start = { x: room.x, y: room.y + Math.floor(room.h / 2) };
  const stairs = { x: room.x + room.w - 1, y: room.y + room.h - 1 };
  tiles[stairs.y * MAP_W + stairs.x] = T_STAIRS;
  if (full.depth >= 2) tiles[start.y * MAP_W + start.x] = T_UP;
  let shrinePos = { x: room.x + Math.floor(room.w / 2), y: room.y };
  if ((shrinePos.x === start.x && shrinePos.y === start.y) || (shrinePos.x === stairs.x && shrinePos.y === stairs.y)) {
    shrinePos = { x: room.x + room.w - 1, y: room.y };
  }
  const glimmer: Floor['glimmer'] = {};
  for (const [k, el] of Object.entries(full.glimmer)) {
    const i = Number(k);
    const x = i % MAP_W;
    const y = (i - x) / MAP_W;
    const inRoom = x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
    const reserved = [start, stairs, shrinePos].some((p) => p.x === x && p.y === y);
    if (inRoom && !reserved) glimmer[i] = el;
  }
  return {
    ...full,
    tiles,
    glimmer,
    rooms: [room],
    start,
    stairs,
    shrine: { pos: shrinePos, offers: null, used: false },
    explored: new Array<number>(MAP_W * MAP_H).fill(0),
    solo: true,
  };
}

function fullLayout(worldSeed: number, depth: number, sprawl: boolean): Floor {
  const rng = new Rng(hashSeed(worldSeed, 'layout', depth));
  const tiles = new Array<number>(MAP_W * MAP_H).fill(T_WALL);
  const rooms: Rect[] = [];
  const target = rng.int(7, 10) + (sprawl ? 3 : 0);
  for (let tries = 0; tries < 300 && rooms.length < target; tries++) {
    const w = rng.int(4, 10);
    const h = rng.int(3, 6);
    const r = { x: rng.int(1, MAP_W - w - 2), y: rng.int(1, MAP_H - h - 2), w, h };
    const overlaps = rooms.some(
      (o) => r.x - 1 < o.x + o.w && r.x + r.w + 1 > o.x && r.y - 1 < o.y + o.h && r.y + r.h + 1 > o.y,
    );
    if (overlaps) continue;
    rooms.push(r);
  }
  // Connect rooms in order of x so corridors read left-to-right; a couple of
  // extra links make loops so the floor isn't a pure tree.
  rooms.sort((a, b) => a.x - b.x);
  for (const r of rooms) carveRoom(tiles, r);
  for (let i = 1; i < rooms.length; i++) carveCorridor(tiles, center(rooms[i - 1]), center(rooms[i]), rng);
  for (let k = 0; k < 2 && rooms.length > 3; k++) {
    const a = rng.int(0, rooms.length - 1);
    const b = rng.int(0, rooms.length - 1);
    if (a !== b) carveCorridor(tiles, center(rooms[a]), center(rooms[b]), rng);
  }

  const startRoom = rng.int(0, rooms.length - 1);
  const start = center(rooms[startRoom]);
  const floor: Floor = {
    depth,
    w: MAP_W,
    h: MAP_H,
    tiles,
    glimmer: {},
    rooms,
    start,
    stairs: start,
    shrine: null,
    explored: new Array<number>(MAP_W * MAP_H).fill(0),
  };

  // Stairs go in the room whose centre is farthest from the start.
  const dist = distanceMap(floor, start);
  let best = start;
  let bestD = -1;
  for (const r of rooms) {
    const c = center(r);
    const d = dist[idx(floor, c.x, c.y)];
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  floor.stairs = best;
  tiles[idx(floor, best.x, best.y)] = T_STAIRS;
  // You arrive by stairs on every floor but the first.
  if (depth >= 2) tiles[idx(floor, start.x, start.y)] = T_UP;

  // Glimmering stones are planted from depth 1, long before Elements can exist.
  const nGlimmer = rng.int(4, 8);
  for (let k = 0; k < nGlimmer; k++) {
    const r = rng.pick(rooms);
    const x = rng.int(r.x, r.x + r.w - 1);
    const y = rng.int(r.y, r.y + r.h - 1);
    const i = idx(floor, x, y);
    if (tiles[i] !== T_FLOOR || (x === start.x && y === start.y)) continue;
    floor.glimmer[i] = rng.pick<Element>(['ember', 'frost']);
  }

  // Every floor has a Rule Shrine; where it stands is part of the geography.
  {
    const candidates = rooms.filter((r) => {
      const c = center(r);
      return !(c.x === start.x && c.y === start.y) && !(c.x === best.x && c.y === best.y);
    });
    if (candidates.length) {
      const r = rng.pick(candidates);
      const c = center(r);
      const pos = { x: c.x, y: Math.max(r.y, c.y - 1) };
      delete floor.glimmer[idx(floor, pos.x, pos.y)];
      floor.shrine = { pos, offers: null, used: false };
    }
  }
  return floor;
}

// ---------------------------------------------------------------------------
// Caverns (M-20): cellular-automaton caves. Wide, doorless, one connected
// space. "Rooms" are the grid cells the cave fills, so everything that
// samples rooms (loot, foes, the bot) works unchanged.
// ---------------------------------------------------------------------------

const CELL_W = 8;
const CELL_H = 7;

function caveTiles(rng: Rng, sprawl: boolean): number[] {
  const S = B.space;
  let t = new Array<number>(MAP_W * MAP_H).fill(T_WALL);
  const fill = S.caveFill - (sprawl ? 0.04 : 0);
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) t[y * MAP_W + x] = rng.chance(fill) ? T_WALL : T_FLOOR;
  for (let step = 0; step < S.caveSteps; step++) {
    const next = t.slice();
    for (let y = 1; y < MAP_H - 1; y++)
      for (let x = 1; x < MAP_W - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && t[(y + dy) * MAP_W + x + dx] === T_WALL) walls++;
        next[y * MAP_W + x] = walls >= 5 ? T_WALL : walls <= 3 ? T_FLOOR : t[y * MAP_W + x];
      }
    t = next;
  }
  return t;
}

/** Keep only the largest connected open region; the rest turns back to rock. */
function keepLargest(tiles: number[], within?: Rect): number {
  const seen = new Int32Array(tiles.length).fill(-1);
  let best = -1;
  let bestSize = 0;
  let id = 0;
  const inside = (x: number, y: number) => !within || (x >= within.x && x < within.x + within.w && y >= within.y && y < within.y + within.h);
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === T_WALL || seen[i] >= 0) continue;
    const q = [i];
    seen[i] = id;
    for (let qi = 0; qi < q.length; qi++) {
      const x = q[qi] % MAP_W;
      const y = (q[qi] - x) / MAP_W;
      for (const d of DIRS) {
        const nx = x + d.x;
        const ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || !inside(nx, ny)) continue;
        const ni = ny * MAP_W + nx;
        if (tiles[ni] === T_WALL || seen[ni] >= 0) continue;
        seen[ni] = id;
        q.push(ni);
      }
    }
    if (q.length > bestSize) {
      bestSize = q.length;
      best = id;
    }
    id++;
  }
  for (let i = 0; i < tiles.length; i++) if (tiles[i] !== T_WALL && seen[i] !== best) tiles[i] = T_WALL;
  return bestSize;
}

/** Open tiles of a cave, inside a rectangle. */
function openIn(tiles: number[], r: Rect): Pos[] {
  const out: Pos[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (tiles[y * MAP_W + x] !== T_WALL) out.push({ x, y });
  return out;
}

/** The open tile nearest a rectangle's centre. */
function nearCentre(tiles: number[], r: Rect): Pos {
  const c = center(r);
  return openIn(tiles, r).sort((a, b) => Math.abs(a.x - c.x) + Math.abs(a.y - c.y) - (Math.abs(b.x - c.x) + Math.abs(b.y - c.y)))[0] ?? c;
}

function caveLayout(worldSeed: number, depth: number, sprawl: boolean): Floor {
  const rng = new Rng(hashSeed(worldSeed, 'cave', depth));
  let tiles = caveTiles(rng, sprawl);
  for (let tries = 0; tries < 8 && keepLargest(tiles) < B.space.caveMinOpen; tries++) tiles = caveTiles(rng, sprawl);
  const rooms: Rect[] = [];
  for (let y = 0; y + CELL_H <= MAP_H; y += CELL_H)
    for (let x = 0; x + CELL_W <= MAP_W; x += CELL_W) {
      const r = { x, y, w: CELL_W, h: CELL_H };
      if (openIn(tiles, r).length >= 12) rooms.push(r);
    }
  const startRoom = rooms[rng.int(0, rooms.length - 1)];
  const start = nearCentre(tiles, startRoom);
  const floor: Floor = {
    depth,
    w: MAP_W,
    h: MAP_H,
    tiles,
    glimmer: {},
    rooms,
    start,
    stairs: start,
    shrine: null,
    explored: new Array<number>(MAP_W * MAP_H).fill(0),
  };
  // The way down is the open tile farthest from where you arrive.
  const dist = distanceMap(floor, start);
  let far = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > dist[far]) far = i;
  floor.stairs = { x: far % MAP_W, y: Math.floor(far / MAP_W) };
  tiles[far] = T_STAIRS;
  if (depth >= 2) tiles[idx(floor, start.x, start.y)] = T_UP;
  const nGlimmer = rng.int(5, 9);
  for (let k = 0; k < nGlimmer; k++) {
    const spots = openIn(tiles, rng.pick(rooms));
    const s = rng.pick(spots);
    const i = idx(floor, s.x, s.y);
    if (tiles[i] !== T_FLOOR) continue;
    floor.glimmer[i] = rng.pick<Element>(['ember', 'frost']);
  }
  const others = rooms.filter((r) => !openIn(tiles, r).some((p) => (p.x === start.x && p.y === start.y) || (p.x === floor.stairs.x && p.y === floor.stairs.y)));
  if (others.length) {
    const pos = nearCentre(tiles, rng.pick(others));
    if (tiles[idx(floor, pos.x, pos.y)] === T_FLOOR) {
      delete floor.glimmer[idx(floor, pos.x, pos.y)];
      floor.shrine = { pos, offers: null, used: false };
    }
  }
  return floor;
}

/**
 * A single-cave floor (no Halls yet): the open tiles of the cave's fullest
 * stretch, so when Halls arrives the pocket you stand in is part of the whole.
 */
function soloCave(full: Floor): Floor {
  const room = full.rooms.reduce((a, b) => (openIn(full.tiles, b).length > openIn(full.tiles, a).length ? b : a), full.rooms[0]);
  // A wider window than one cell, so the pocket has room to move in.
  const r = { x: Math.max(0, room.x - 4), y: Math.max(0, room.y - 3), w: Math.min(MAP_W, room.w + 8), h: Math.min(MAP_H, room.h + 6) };
  r.w = Math.min(r.w, MAP_W - r.x);
  r.h = Math.min(r.h, MAP_H - r.y);
  const tiles = new Array<number>(MAP_W * MAP_H).fill(T_WALL);
  for (const p of openIn(full.tiles, r)) tiles[idx(full, p.x, p.y)] = T_FLOOR;
  keepLargest(tiles, r);
  const open = openIn(tiles, r);
  const probe: Floor = { ...full, tiles, rooms: [r], glimmer: {}, explored: [] };
  const start = nearCentre(tiles, r);
  const dist = distanceMap(probe, start);
  const stairs = open.reduce((a, b) => (dist[idx(full, b.x, b.y)] > dist[idx(full, a.x, a.y)] ? b : a), start);
  tiles[idx(full, stairs.x, stairs.y)] = T_STAIRS;
  if (full.depth >= 2) tiles[idx(full, start.x, start.y)] = T_UP;
  // The shrine stands about halfway between.
  const half = dist[idx(full, stairs.x, stairs.y)] >> 1;
  const shrinePos = open.find((p) => dist[idx(full, p.x, p.y)] === half && !(p.x === start.x && p.y === start.y)) ?? open.find((p) => !(p.x === start.x && p.y === start.y) && !(p.x === stairs.x && p.y === stairs.y))!;
  const glimmer: Floor['glimmer'] = {};
  for (const [k, el] of Object.entries(full.glimmer)) {
    const i = Number(k);
    const reserved = [start, stairs, shrinePos].some((p) => idx(full, p.x, p.y) === i);
    if (tiles[i] === T_FLOOR && !reserved) glimmer[i] = el;
  }
  return {
    ...full,
    tiles,
    glimmer,
    rooms: [r],
    start,
    stairs,
    shrine: { pos: shrinePos, offers: null, used: false },
    explored: new Array<number>(MAP_W * MAP_H).fill(0),
    solo: true,
  };
}

export function randomFloorTile(f: Floor, rng: Rng, avoid: (x: number, y: number) => boolean): Pos | null {
  for (let tries = 0; tries < 200; tries++) {
    const r = rng.pick(f.rooms);
    const x = rng.int(r.x, r.x + r.w - 1);
    const y = rng.int(r.y, r.y + r.h - 1);
    if (f.tiles[idx(f, x, y)] !== T_FLOOR) continue;
    if (avoid(x, y)) continue;
    return { x, y };
  }
  return null;
}
