import { idx, inBounds } from './dungeon.ts';
import { T_WALL, type Floor, type Pos } from './types.ts';

/** True when nothing opaque lies strictly between a and b (Bresenham). */
export function lineOfSight(f: Floor, a: Pos, b: Pos): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === b.x && y === b.y) return true;
    if (!(x === a.x && y === a.y) && f.tiles[idx(f, x, y)] === T_WALL) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Tiles visible from `from` within `radius` (Euclidean). Walls are visible when
 * the line reaches them, so rooms show their outline.
 */
export function computeVisible(f: Floor, from: Pos, radius: number): Set<number> {
  const out = new Set<number>();
  if (radius === Infinity) {
    for (let i = 0; i < f.w * f.h; i++) out.add(i);
    return out;
  }
  const r = Math.ceil(radius);
  for (let y = from.y - r; y <= from.y + r; y++) {
    for (let x = from.x - r; x <= from.x + r; x++) {
      if (!inBounds(f, x, y)) continue;
      const ddx = x - from.x;
      const ddy = y - from.y;
      if (ddx * ddx + ddy * ddy > radius * radius + radius) continue;
      if (lineOfSight(f, from, { x, y })) out.add(idx(f, x, y));
    }
  }
  return out;
}
