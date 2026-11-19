import { hashSeed, Rng } from './rng.ts';
import { T_FLOOR, T_STAIRS, T_WALL, type Element, type Floor, type Pos, type Rect } from './types.ts';

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

/**
 * Floor geography is a function of the world seed and depth only, so every heir
 * walks the same halls — and graves stay where their owners fell.
 */
export function generateLayout(worldSeed: number, depth: number): Floor {
  const rng = new Rng(hashSeed(worldSeed, 'layout', depth));
  const tiles = new Array<number>(MAP_W * MAP_H).fill(T_WALL);
  const rooms: Rect[] = [];
  const target = rng.int(7, 10);
  for (let tries = 0; tries < 200 && rooms.length < target; tries++) {
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

  // Shrine position is part of the geography; whether it exists is content.
  if (depth >= 2) {
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
