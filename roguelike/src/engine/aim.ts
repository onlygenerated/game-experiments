/**
 * Aiming geometry for Means of Harm: straight lines for shots and bolts.
 * (What is said aloud travels by path instead: dungeon.ts's distanceMap.)
 */
import { passable } from './dungeon.ts';
import type { Floor, Pos } from './types.ts';

/**
 * The tiles a shot passes over, aimed from `from` through `to` and carried on
 * in the same direction until `range` tiles: the exact line from `from` to
 * `to`, repeated, so it always passes through the tile aimed at. Stops before
 * the first wall; `from` itself is not included.
 */
export function ray(f: Floor, from: Pos, to: Pos, range: number): Pos[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const out: Pos[] = [];
  if (!dx && !dy) return out;
  let a = from;
  while (out.length < range) {
    const b = { x: a.x + dx, y: a.y + dy };
    for (const t of line(a, b)) {
      if (!passable(f, t.x, t.y)) return out;
      out.push(t);
      if (out.length >= range) return out;
    }
    a = b;
  }
  return out;
}

/** Bresenham tiles from a to b, excluding a, including b. */
export function line(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  let x = a.x;
  let y = a.y;
  while (!(x === b.x && y === b.y)) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push({ x, y });
  }
  return out;
}
