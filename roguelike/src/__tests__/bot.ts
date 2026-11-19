import { DIRS, distanceMap, idx } from '../engine/dungeon.ts';
import type { Action, Game } from '../engine/game.ts';
import type { Rng } from '../engine/rng.ts';

/**
 * A simple greedy player used by tests to drive real runs: fight what's near,
 * drink when low, take the first shrine offer, otherwise head for the stairs.
 */
export function botAction(g: Game, rng: Rng): Action {
  const run = g.run;
  const p = run.player;
  if (run.pending?.kind === 'shrine') {
    const offers = run.floor.shrine?.offers ?? [];
    return { type: 'shrine', rule: offers.length ? offers[0] : null };
  }
  if (run.pending?.kind === 'levelup') return { type: 'levelup', stat: rng.pick(['str', 'agi', 'vit'] as const) };

  const s = g.stats;
  if (p.hp < s.maxHp * 0.4) {
    const potion = p.inventory.find((i) => i.kind === 'potion');
    if (potion) return { type: 'use', id: potion.id };
    if (g.has('arcana') && p.mana >= 3) return { type: 'ability', ability: 'mend' };
  }
  if (g.has('hunger') && p.satiety < 150) {
    const food = p.inventory.find((i) => i.kind === 'food');
    if (food) return { type: 'use', id: food.id };
  }
  if (g.has('arms')) {
    const w = p.inventory.find((i) => i.kind === 'weapon' && (i.atk ?? 0) > (p.weapon?.atk ?? 0));
    if (w) return { type: 'equip', id: w.id };
    const a = p.inventory.find((i) => i.kind === 'armor' && (i.def ?? 0) > (p.armor?.def ?? 0));
    if (a) return { type: 'equip', id: a.id };
  }
  for (const d of DIRS) {
    if (g.monsterAt(p.x + d.x, p.y + d.y)) return { type: 'move', dx: d.x, dy: d.y };
  }
  const f = run.floor;
  if (p.x === f.stairs.x && p.y === f.stairs.y && rng.chance(0.7)) return { type: 'descend' };

  // Head for a target: an unused shrine, the nearest item, otherwise the stairs.
  const targets = [
    ...(f.shrine && !f.shrine.used && rng.chance(0.8) ? [f.shrine.pos] : []),
    ...run.items.filter((i) => i.item.kind === 'gold' || p.inventory.length < 12).map((i) => ({ x: i.x, y: i.y })),
    f.stairs,
  ];
  const target = targets[0];
  const dist = distanceMap(f, target);
  let best: { dx: number; dy: number } | null = null;
  let bestD = dist[idx(f, p.x, p.y)];
  for (const d of DIRS) {
    const nx = p.x + d.x;
    const ny = p.y + d.y;
    if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
    const nd = dist[idx(f, nx, ny)];
    if (nd >= 0 && nd < bestD) {
      bestD = nd;
      best = { dx: d.x, dy: d.y };
    }
  }
  if (best && rng.chance(0.9)) return { type: 'move', ...best };
  const d = rng.pick(DIRS);
  return { type: 'move', dx: d.x, dy: d.y };
}
