import { alt, has, RULE_ORDER, RULES, type RuleCtx } from '../rules/rules.ts';
import type { Lexicon } from '../theme/lexicon.ts';
import { BALANCE as B } from './balance.ts';
import { idx, randomFloorTile } from './dungeon.ts';
import type { Rng } from './rng.ts';
import type { Element, Floor, FloorItem, Item, ItemKind, Monster, MonsterKind } from './types.ts';

/** Arms genotypes. Their names come from the premise, index for index. */
interface ArmsDef {
  value: number;
  weight: number;
  dur: number;
  minDepth: number;
}

// Attack grows with weight, so the best weapons are exactly the ones Weight punishes.
export const WEAPONS: ArmsDef[] = [
  { value: 2, weight: 1, dur: 30, minDepth: 1 },
  { value: 3, weight: 2, dur: 40, minDepth: 1 },
  { value: 4, weight: 3, dur: 35, minDepth: 2 },
  { value: 6, weight: 5, dur: 30, minDepth: 3 },
  { value: 8, weight: 6, dur: 45, minDepth: 3 },
  { value: 10, weight: 8, dur: 50, minDepth: 5 },
];

export const ARMORS: ArmsDef[] = [
  { value: 1, weight: 1, dur: 40, minDepth: 1 },
  { value: 2, weight: 3, dur: 50, minDepth: 2 },
  { value: 4, weight: 5, dur: 60, minDepth: 4 },
];

/** Foe genotypes. Names, glyphs and colours come from the premise. */
interface MonsterDef {
  hp: number;
  atk: number;
  def: number;
  xp: number;
  /** Ticks per action: 2 = acts twice per turn, 0.5 = every other turn. */
  speed: number;
  erratic: boolean;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat: { hp: 3, atk: 1, def: 0, xp: 2, speed: 1, erratic: false },
  bat: { hp: 4, atk: 2, def: 0, xp: 3, speed: 2, erratic: true },
  goblin: { hp: 8, atk: 3, def: 1, xp: 5, speed: 1, erratic: false },
  slime: { hp: 12, atk: 2, def: 0, xp: 4, speed: 0.5, erratic: false },
};

export interface GenCtx {
  rng: Rng;
  ctx: RuleCtx;
  /** The world's words: what generated things are called. */
  lex: Lexicon;
  nextId: () => number;
}

/** Index into the table of an arms entry for this depth. */
function pickArms(table: ArmsDef[], depth: number, rng: Rng): number {
  const ok = table.map((d, i) => [d, i] as const).filter(([d]) => d.minDepth <= depth + 1);
  // Favour the newest-unlocked entries so deeper floors feel like an upgrade.
  return rng.weighted(ok.map(([, i], k) => [i, 1 + k] as [number, number]));
}

export function makeItem(kind: ItemKind, depth: number, g: GenCtx): Item {
  const { rng } = g;
  const base = { id: g.nextId(), kind, weight: 0, element: null as Element | null, dur: 0, maxDur: 0 };
  switch (kind) {
    case 'potion':
      return { ...base, name: g.lex.premise.items.restorative, heal: B.potion.heal };
    case 'gold':
      return { ...base, name: g.lex.premise.items.currency, amount: rng.int(B.loot.goldPile[0], B.loot.goldPile[1]) + depth * B.loot.goldPerDepth };
    case 'food': {
      const i = rng.weighted(B.food.kinds.map((k, i) => [i, k[1]] as [number, number]));
      return { ...base, name: g.lex.premise.items.foods[i], nourish: B.food.kinds[i][0] };
    }
    case 'weapon':
    case 'armor': {
      const table = kind === 'weapon' ? WEAPONS : ARMORS;
      const i = pickArms(table, depth, rng);
      const def = table[i];
      const element = kind === 'weapon' && rng.chance(B.loot.elementalWeaponChance) ? rng.pick<Element>(['ember', 'frost']) : null;
      return {
        ...base,
        name: (kind === 'weapon' ? g.lex.premise.items.weapons : g.lex.premise.items.armors)[i],
        ...(kind === 'weapon' ? { atk: def.value } : { def: def.value }),
        weight: def.weight,
        element,
        dur: def.dur * B.durability.scale,
        maxDur: def.dur * B.durability.scale,
      };
    }
  }
}

export function makeMonster(kind: MonsterKind, depth: number, g: GenCtx, x: number, y: number): Monster {
  const def = MONSTERS[kind];
  const growth = has(g.ctx, 'growth');
  const hp = def.hp + Math.floor((depth - 1) * B.monsters.hpPerDepth[growth ? 0 : 1]);
  const atk = def.atk + Math.floor((depth - 1) / B.monsters.atkEveryDepths[growth ? 0 : 1]);
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
    element: g.rng.chance(B.monsters.elementalChance) ? g.rng.pick<Element>(['ember', 'frost']) : null,
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
  return RULES[rule].loot?.(floor.depth, g, makeItem) ?? [];
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
  const M = B.monsters;
  let count = Math.min(M.countCap, M.countBase + Math.ceil(floor.depth * M.countPerDepth));
  if (alt(ctx, 'bestiary')) count += M.swarmExtra;
  if (floor.solo) {
    const r = floor.rooms[0];
    count = Math.min(count, Math.max(2, Math.floor((r.w * r.h) / M.soloTilesPerFoe)));
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
  for (const rule of RULE_ORDER) {
    if (has(g.ctx, rule) && RULES[rule].loot) loot.push(...itemsForRule(rule, floor, g));
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

/** What an item is called right now: currency shows its amount, and Elements reveals an element. */
export function itemLabel(item: Item, ctx: RuleCtx, lex: Lexicon): string {
  if (item.kind === 'gold') return lex.t('item.currency', { n: item.amount ?? 0 });
  if (item.element && has(ctx, 'elements')) return lex.t('item.elemental', { Element: lex.element(item.element).Adj, item: item.name });
  return item.name;
}

export function itemGlyph(item: Item): string {
  return { potion: '!', gold: '$', weapon: ')', armor: '[', food: '%' }[item.kind];
}
