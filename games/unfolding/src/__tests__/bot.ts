import { DIRS, distanceMap, idx, passable } from '../engine/dungeon.ts';
import type { Action, Game } from '../engine/game.ts';
import type { Rng } from '../engine/rng.ts';
import { T_UP, type Item } from '../engine/types.ts';
import { derive } from '../rules/rules.ts';

/**
 * How to fight, whatever the world's Means of Harm: aim at whatever is in
 * reach, shove what's in the way when there's nothing to aim with, and wait
 * for mana rather than walk into a crowd empty-handed. Null: nothing to fight.
 */
export function fightAction(g: Game): Action | null {
  const p = g.run.player;
  const adjacent = DIRS.find((d) => g.monsterAt(p.x + d.x, p.y + d.y));
  const means = g.means;
  if (means.reach === 'adjacent') return adjacent ? { type: 'move', dx: adjacent.x, dy: adjacent.y } : null;
  const loaded = means.cost === 'ammo' ? (p.ammo ?? 0) > 0 : means.cost === 'mana' ? p.mana >= 1 : true;
  const target = g.targets()[0];
  if (target && loaded) return { type: 'fire', x: target.x, y: target.y };
  if (adjacent) return { type: 'move', dx: adjacent.x, dy: adjacent.y };
  // Arcanum, out of mana with foes about: let it come back.
  if (means.cost === 'mana' && target) return { type: 'wait' };
  return null;
}

/** Answer whatever is pending that isn't a rule shrine or a level-up: schisms and shops. */
function pendingAction(g: Game, rng: Rng): Action | null {
  const run = g.run;
  if (run.pending?.kind === 'schism') {
    const offers = run.floor.schism?.offers ?? [];
    return { type: 'schism', harm: offers.length ? rng.pick(offers) : null };
  }
  if (run.pending?.kind === 'shop') {
    const p = run.player;
    const stock = run.floor.merchant?.stock ?? [];
    const want = stock.find((i) => (i.kind === 'potion' || i.kind === 'ammo' || (i.kind === 'food' && g.has('hunger'))) && g.priceOf(i) <= p.gold && (i.kind === 'ammo' || p.inventory.length < 10));
    if (want) return { type: 'buy', id: want.id };
    return { type: 'leaveShop' };
  }
  return null;
}

/**
 * A simple greedy player used by tests to drive real runs: fight what's near,
 * drink when low, take the first shrine offer, otherwise head for the stairs.
 */
/** Per-game memory for the explorer: which rooms of the current floor it has stood in. */
const seenRooms = new WeakMap<Game, { floor: unknown; rooms: Set<number> }>();
/** Floors whose merchant the explorer has already visited. */
const visitedShop = new WeakSet<object>();

/**
 * A thorough player: visits every room before descending, eats when Hungry,
 * drinks below 40% HP, fights what comes to it. Closer to how a person plays
 * than the greedy bot, so it's what the balance probe uses.
 */
export function explorerAction(g: Game, rng: Rng, opts: { shrines?: boolean } = {}): Action {
  const run = g.run;
  const p = run.player;
  const f = run.floor;
  const other = pendingAction(g, rng);
  if (other) return other;
  if (run.pending?.kind === 'shrine') {
    const offers = f.shrine?.offers ?? [];
    if (opts.shrines === false) {
      // Refuse for good: mark it so the explorer stops walking back to it.
      if (f.shrine) f.shrine.used = true;
      return { type: 'shrine', rule: null };
    }
    return { type: 'shrine', rule: offers.length ? rng.pick(offers) : null };
  }
  if (run.pending?.kind === 'levelup') return { type: 'levelup', stat: rng.pick(['str', 'agi', 'vit'] as const) };
  const s = g.stats;
  if (g.has('peril') && p.hp < s.maxHp * 0.4) {
    const potion = p.inventory.find((i) => i.kind === 'potion');
    if (potion) return { type: 'use', id: potion.id };
    if (g.has('arcana') && p.mana >= 3) return { type: 'ability', ability: 'mend' };
  }
  if (g.has('hunger') && p.satiety < 250) {
    const food = p.inventory.find((i) => i.kind === 'food');
    if (food) return { type: 'use', id: food.id };
  }
  if (g.has('arms')) {
    // Judge gear by what it actually does under the current rules, as a person would.
    const better = (kind: 'weapon' | 'armor') => {
      const score = (it: Item | null) => gearScore(g, kind, it);
      const now = score(p[kind]);
      return p.inventory.filter((i) => i.kind === kind).find((i) => score(i) > now + 0.01);
    };
    const w = better('weapon') ?? (!p.weapon ? p.inventory.find((i) => i.kind === 'weapon') : undefined);
    if (w) return { type: 'equip', id: w.id };
    const a = better('armor');
    if (a) return { type: 'equip', id: a.id };
  }
  const fight = fightAction(g);
  if (fight) return fight;
  // Like a person, drop spare arms (keeping one spare weapon) rather than walk past food with a full pack.
  const spares = p.inventory.filter((i) => i.kind === 'weapon' || i.kind === 'armor');
  const junk = spares.find((i) => i.kind === 'armor') ?? (spares.length > 1 ? spares[0] : undefined);
  if (junk && p.inventory.length >= 10 && !g.itemsHere().length) return { type: 'drop', id: junk.id };

  let mem = seenRooms.get(g);
  if (!mem || mem.floor !== f) seenRooms.set(g, (mem = { floor: f, rooms: new Set() }));
  f.rooms.forEach((r, i) => {
    if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) mem!.rooms.add(i);
  });
  // A room's centre, or (in a cave, where the centre may be rock) the open tile nearest it.
  const centre = (i: number) => {
    const r = f.rooms[i];
    const c = { x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) };
    if (passable(f, c.x, c.y)) return c;
    let best = c;
    let bd = Infinity;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const d = Math.abs(x - c.x) + Math.abs(y - c.y);
        if (d < bd && passable(f, x, y)) {
          bd = d;
          best = { x, y };
        }
      }
    return best;
  };
  const unseen = f.rooms.map((_, i) => i).filter((i) => !mem!.rooms.has(i));
  const near = (ts: { x: number; y: number }[]) => {
    const dist = distanceMap(f, p);
    return ts.filter((t) => dist[idx(f, t.x, t.y)] > 0).sort((a, b) => dist[idx(f, a.x, a.y)] - dist[idx(f, b.x, b.y)])[0];
  };
  const loot = run.items
    .filter((i) => {
      if (i.item.kind === 'gold' || i.item.kind === 'ammo') return true;
      if (p.inventory.length >= 10) return false;
      if (i.item.kind !== 'weapon' && i.item.kind !== 'armor') return true;
      if (!g.has('arms')) return false;
      const kind = i.item.kind;
      const spareWeapon = kind === 'weapon' && !p.inventory.some((x) => x.kind === 'weapon');
      return spareWeapon || gearScore(g, kind, i.item) > gearScore(g, kind, p[kind]) + 0.01;
    })
    .map((i) => ({ x: i.x, y: i.y }));
  const shrine = f.shrine && !f.shrine.used ? [f.shrine.pos] : [];
  if (f.schism && !f.schism.used && !g.harmSettled) shrine.push(f.schism.pos);
  // Visit a merchant once per floor, with something to spend.
  const shop = f.merchant && g.has('commerce') && p.gold >= 15 && !visitedShop.has(f) ? [f.merchant.pos] : [];
  if (f.merchant && p.x === f.merchant.pos.x && p.y === f.merchant.pos.y) visitedShop.add(f);
  const target = near(loot) ?? near(shrine) ?? near(shop) ?? (unseen.length ? near(unseen.map(centre)) : undefined);
  if (!target) {
    if (p.x === f.stairs.x && p.y === f.stairs.y) return { type: 'descend' };
    return stepToward(g, f.stairs, rng);
  }
  return stepToward(g, target, rng);
}

function stepToward(g: Game, target: { x: number; y: number }, rng: Rng): Action {
  const f = g.run.floor;
  const p = g.run.player;
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
  if (best) return { type: 'move', ...best };
  const d = rng.pick(DIRS);
  return { type: 'move', dx: d.x, dy: d.y };
}

/** How good a weapon (attack per turn, plus stagger) or armour (defense, halved if it slows you) is right now. */
function gearScore(g: Game, kind: 'weapon' | 'armor', it: Item | null): number {
  const p = g.run.player;
  const d = derive({ ...p, [kind]: it }, g.ctx);
  return kind === 'weapon' ? (d.attack / d.attackCost) * (1 + d.stagger) : d.defense / d.moveCost;
}

export function botAction(g: Game, rng: Rng): Action {
  const run = g.run;
  const p = run.player;
  const other = pendingAction(g, rng);
  if (other) return other;
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
  const fight = fightAction(g);
  if (fight) return fight;
  const f = run.floor;
  if (p.x === f.stairs.x && p.y === f.stairs.y && rng.chance(0.7)) return { type: 'descend' };
  // Now and then, go back up — exercises remembered floors.
  if (f.tiles[idx(f, p.x, p.y)] === T_UP && rng.chance(0.08)) return { type: 'ascend' };

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
