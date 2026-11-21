/**
 * Pointy-top hexes in axial coordinates (q, r).
 *
 * Axial drops the redundant third cube coordinate: s is always -q-r, which is
 * why distance reconstructs it rather than storing it. Six neighbours, but only
 * **three axes** — each axis is a direction and its opposite — so a placement
 * joins three lines here against two on a square grid.
 */
export interface Hex {
  q: number;
  r: number;
}

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export function parseHex(key: string): Hex {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export const hexEq = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export const hexScale = (h: Hex, k: number): Hex => ({ q: h.q * k, r: h.r * k });

/** The six neighbours, clockwise from east. */
export const HEX_DIRS: readonly Hex[] = [
  { q: 1, r: 0 }, // E
  { q: 1, r: -1 }, // NE
  { q: 0, r: -1 }, // NW
  { q: -1, r: 0 }, // W
  { q: -1, r: 1 }, // SW
  { q: 0, r: 1 }, // SE
];

/** One direction per opposite pair. A line runs both ways along each. */
export const HEX_AXES: readonly Hex[] = [
  { q: 1, r: 0 }, // E-W
  { q: 1, r: -1 }, // NE-SW
  { q: 0, r: 1 }, // SE-NW
];

export const HEX_AXIS_NAMES = ['E–W', 'NE–SW', 'NW–SE'] as const;
export type HexAxis = 0 | 1 | 2;

export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRS.map((d) => hexAdd(h, d));
}

/**
 * Steps between two hexes. Reconstructs the cube s = -q-r, since the three cube
 * deltas always sum to zero and the distance is the largest absolute one.
 */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

export const ORIGIN: Hex = { q: 0, r: 0 };

/** Rings from the origin outward. 3n² + 3n + 1 hexes for radius n. */
export function hexesWithinRadius(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius);
    const hi = Math.min(radius, -q + radius);
    for (let r = lo; r <= hi; r++) out.push({ q, r });
  }
  return out;
}

/**
 * Pixel centre for rendering, pointy-top. Returned in units of `size` (the
 * circumradius), so the caller scales once.
 */
export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (h.q + h.r / 2),
    y: size * 1.5 * h.r,
  };
}
