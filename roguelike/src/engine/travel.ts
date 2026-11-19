import { DIRS, idx, inBounds } from './dungeon.ts';
import type { Game } from './game.ts';
import { T_WALL, type Monster, type Pos } from './types.ts';

/** Tiles auto-travel may route through: known, open and — when there's a choice — not hazardous. */
function walkable(game: Game, x: number, y: number, avoidHazards: boolean): boolean {
  const f = game.run.floor;
  if (!inBounds(f, x, y)) return false;
  const i = idx(f, x, y);
  if (f.tiles[i] === T_WALL) return false;
  if (game.has('darkness') && !f.explored[i]) return false;
  if (avoidHazards && game.has('elements') && f.glimmer[i]) return false;
  return true;
}

function distancesTo(game: Game, target: Pos, avoidHazards: boolean): Int16Array {
  const f = game.run.floor;
  const dist = new Int16Array(f.w * f.h).fill(-1);
  const start = idx(f, target.x, target.y);
  dist[start] = 0;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % f.w;
    const y = (i - x) / f.w;
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      // The player's own tile must be reachable even if it's a hazard.
      const isPlayer = nx === game.run.player.x && ny === game.run.player.y;
      if (!isPlayer && !walkable(game, nx, ny, avoidHazards)) continue;
      const ni = idx(f, nx, ny);
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[i] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

/** Can the player auto-travel to this tile at all? */
export function canTravelTo(game: Game, t: Pos): boolean {
  const p = game.run.player;
  if (t.x === p.x && t.y === p.y) return false;
  if (!walkable(game, t.x, t.y, false)) return false;
  return distancesTo(game, t, false)[idx(game.run.floor, p.x, p.y)] > 0;
}

/**
 * The next step toward `target`, or null when there is no way forward.
 * Prefers a route around ember and frost stones; walks through them only when
 * nothing else reaches the target (or the target is one).
 */
export function travelStep(game: Game, target: Pos): Pos | null {
  const f = game.run.floor;
  const p = game.run.player;
  for (const avoid of [true, false]) {
    if (avoid && !walkable(game, target.x, target.y, true)) continue;
    const dist = distancesTo(game, target, avoid);
    const here = dist[idx(f, p.x, p.y)];
    if (here <= 0) continue;
    let best: Pos | null = null;
    let bestD = here;
    for (const d of DIRS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      if (!inBounds(f, nx, ny)) continue;
      const nd = dist[idx(f, nx, ny)];
      if (nd >= 0 && nd < bestD && !game.monsterAt(nx, ny)) {
        bestD = nd;
        best = d;
      }
    }
    if (best) return best;
  }
  return null;
}

const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Radius within which a visible monster counts as a reason to stop. */
export const THREAT_RADIUS = 5;

/** Visible monsters close enough to interrupt travel. */
export function nearbyThreats(game: Game): Monster[] {
  const p = game.run.player;
  return game.run.monsters.filter((m) => game.isVisible(m.x, m.y) && cheb(m, p) <= THREAT_RADIUS);
}
