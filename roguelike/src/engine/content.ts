import { alt, has, RULES, type RuleCtx } from '../rules/rules.ts';
import { idx, randomFloorTile } from './dungeon.ts';
import type { Rng } from './rng.ts';
import type { Element, Floor, FloorItem, Item, ItemKind, Monster, MonsterKind } from './types.ts';

interface ArmsDef {
  name: string;
  value: number;
  weight: number;
  dur: number;
  minDepth: number;
}

// Attack grows with weight, so the best weapons are exactly the ones Weight punishes.
export const WEAPONS: ArmsDef[] = [
  { name: 'Dagger', value: 2, weight: 1, dur: 30, minDepth: 1 },
  { name: 'Short Sword', value: 3, weight: 2, dur: 40, minDepth: 1 },
  { name: 'Spear', value: 4, weight: 3, dur: 35, minDepth: 2 },
  { name: 'War Axe', value: 6, weight: 5, dur: 30, minDepth: 3 },
  { name: 'Greatsword', value: 8, weight: 6, dur: 45, minDepth: 3 },
  { name: 'Maul', value: 10, weight: 8, dur: 50, minDepth: 5 },
];

export const ARMORS: ArmsDef[] = [
  { name: 'Leather', value: 1, weight: 1, dur: 40, minDepth: 1 },
  { name: 'Chain Mail', value: 2, weight: 3, dur: 50, minDepth: 2 },
  { name: 'Plate', value: 4, weight: 5, dur: 60, minDepth: 4 },
];

interface MonsterDef {
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  /** Ticks per action: 2 = acts twice per turn, 0.5 = every other turn. */
  speed: number;
  erratic: boolean;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat: { name: 'rat', glyph: 'r', hp: 3, atk: 1, def: 0, xp: 2, speed: 1, erratic: false },
  bat: { name: 'bat', glyph: 'b', hp: 4, atk: 2, def: 0, xp: 3, speed: 2, erratic: true },
  goblin: { name: 'goblin', glyph: 'g', hp: 8, atk: 3, def: 1, xp: 5, speed: 1, erratic: false },
  slime: { name: 'slime', glyph: 's', hp: 12, atk: 2, def: 0, xp: 4, speed: 0.5, erratic: false },
};

export interface GenCtx {
  rng: Rng;
  ctx: RuleCtx;
  nextId: () => number;
}

function pickArms(table: ArmsDef[], depth: number, rng: Rng): ArmsDef {
  const ok = table.filter((d) => d.minDepth <= depth + 1);
  // Favour the newest-unlocked entries so deeper floors feel like an upgrade.
  return rng.weighted(ok.map((d, i) => [d, 1 + i] as [ArmsDef, number]));
}

export function makeItem(kind: ItemKind, depth: number, g: GenCtx): Item {
  const { rng } = g;
  const base = { id: g.nextId(), kind, weight: 0, element: null as Element | null, dur: 0, maxDur: 0 };
  switch (kind) {
    case 'potion':
      return { ...base, name: 'Healing Potion', heal: 8 };
    case 'gold':
      return { ...base, name: 'Gold', amount: rng.int(3, 8) + depth * 2 };
    case 'food':
      return rng.chance(0.6)
        ? { ...base, name: 'Ration', nourish: 300 }
        : { ...base, name: 'Dried Meat', nourish: 150 };
    case 'weapon':
    case 'armor': {
      const def = pickArms(kind === 'weapon' ? WEAPONS : ARMORS, depth, rng);
      const element = kind === 'weapon' && rng.chance(0.3) ? rng.pick<Element>(['ember', 'frost']) : null;
      return {
        ...base,
        name: def.name,
        ...(kind === 'weapon' ? { atk: def.value } : { def: def.value }),
        weight: def.weight,
        element,
        dur: def.dur,
        maxDur: def.dur,
      };
    }
  }
}

export function makeMonster(kind: MonsterKind, depth: number, g: GenCtx, x: number, y: number): Monster {
  const def = MONSTERS[kind];
  const growth = has(g.ctx, 'growth');
  const hp = def.hp + (depth - 1) * (growth ? 2 : 1);
  const atk = def.atk + Math.floor((depth - 1) / (growth ? 2 : 3));
  return {
    id: g.nextId(),
    kind,
    x,
    y,
    hp,
    maxHp: hp,
    atk,
    def: def.def,
    xp: def.xp + depth,
    aware: false,
    stun: 0,
    element: g.rng.chance(0.25) ? g.rng.pick<Element>(['ember', 'frost']) : null,
  };
}

export function monsterKindFor(depth: number, g: GenCtx): MonsterKind {
  if (!has(g.ctx, 'bestiary')) return 'rat';
  const table: [MonsterKind, number][] = [
    ['rat', 3],
    ['bat', 2],
  ];
  if (depth >= 4) table.push(['goblin', 2]);
  if (depth >= 5) table.push(['slime', 1]);
  return g.rng.weighted(table);
}

/** Items a rule contributes to one floor. Used at generation and when a rule arrives mid-floor. */
export function itemsForRule(rule: keyof typeof RULES, floor: Floor, g: GenCtx): Item[] {
  const d = floor.depth;
  const { rng } = g;
  const out: Item[] = [];
  if (rule === 'things') {
    const potions = rng.int(1, 2);
    for (let i = 0; i < potions; i++) out.push(makeItem('potion', d, g));
    const gold = rng.int(1, 3);
    for (let i = 0; i < gold; i++) out.push(makeItem('gold', d, g));
  }
  if (rule === 'arms') {
    const n = alt(g.ctx, 'arms') ? 2 : 1;
    for (let i = 0; i < n; i++) {
      out.push(makeItem('weapon', d, g));
      if (rng.chance(0.6)) out.push(makeItem('armor', d, g));
    }
  }
  if (rule === 'hunger') {
    out.push(makeItem('food', d, g));
    if (rng.chance(0.5)) out.push(makeItem('food', d, g));
  }
  return out;
}

export function scatter(items: Item[], floor: Floor, g: GenCtx, taken: (x: number, y: number) => boolean): FloorItem[] {
  const out: FloorItem[] = [];
  for (const item of items) {
    const p = randomFloorTile(floor, g.rng, (x, y) => taken(x, y) || out.some((o) => o.x === x && o.y === y));
    if (p) out.push({ item, x: p.x, y: p.y });
  }
  return out;
}

/** How many foes a floor holds under Peril. A single room gets a smaller crowd. */
export function monsterCount(floor: Floor, ctx: RuleCtx): number {
  let count = Math.min(14, 4 + Math.ceil(floor.depth * 1.2));
  if (alt(ctx, 'bestiary')) count += 2;
  if (floor.solo) {
    const r = floor.rooms[0];
    count = Math.min(count, Math.max(2, Math.floor((r.w * r.h) / 9)));
  }
  return count;
}

/** Place `count` foes on open tiles that `avoid` doesn't rule out. */
export function spawnMonsters(floor: Floor, g: GenCtx, count: number, avoid: (x: number, y: number) => boolean): Monster[] {
  const monsters: Monster[] = [];
  const occupied = (x: number, y: number) =>
    avoid(x, y) || monsters.some((m) => m.x === x && m.y === y) || floor.glimmer[idx(floor, x, y)] !== undefined;
  for (let i = 0; i < count; i++) {
    const p = randomFloorTile(floor, g.rng, occupied);
    if (!p) continue;
    monsters.push(makeMonster(monsterKindFor(floor.depth, g), floor.depth, g, p.x, p.y));
  }
  return monsters;
}

/** Loot from every active item-bearing rule. */
export function lootFor(floor: Floor, g: GenCtx): Item[] {
  const loot: Item[] = [];
  for (const rule of ['things', 'arms', 'hunger'] as const) {
    if (has(g.ctx, rule)) loot.push(...itemsForRule(rule, floor, g));
  }
  return loot;
}

export function populate(floor: Floor, g: GenCtx): { monsters: Monster[]; items: FloorItem[] } {
  const near = floor.solo ? 1 : 2;
  const isStart = (x: number, y: number) => Math.abs(x - floor.start.x) <= near && Math.abs(y - floor.start.y) <= near;
  const shrineAt = (x: number, y: number) => !!floor.shrine && floor.shrine.pos.x === x && floor.shrine.pos.y === y;
  const monsters = has(g.ctx, 'peril') ? spawnMonsters(floor, g, monsterCount(floor, g.ctx), (x, y) => isStart(x, y) || shrineAt(x, y)) : [];
  const items = scatter(lootFor(floor, g), floor, g, (x, y) => (x === floor.start.x && y === floor.start.y) || shrineAt(x, y));
  return { monsters, items };
}

export function itemLabel(item: Item, ctx: RuleCtx): string {
  let name = item.name;
  if (item.kind === 'gold') return `${item.amount} gold`;
  if (item.element && has(ctx, 'elements')) name = `${item.element === 'ember' ? 'Ember' : 'Frost'} ${name}`;
  return name;
}

export function itemGlyph(item: Item): string {
  return { potion: '!', gold: '$', weapon: ')', armor: '[', food: '%' }[item.kind];
}
