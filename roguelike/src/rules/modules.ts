/**
 * Rule modules: each rule's behaviour (its genotype) in one place, as hooks the
 * engine calls. No player-visible words live here; text comes from the
 * world's lexicon, and names, prerequisites aside, from its premise.
 *
 * Hooks:
 *  - derive:           adjust the character's numbers while the rule is active
 *  - loot:             items the rule puts on a floor (generation and arrival)
 *  - reinterpretFloor: what the rule does to the current floor when it arrives,
 *                      here or while you were on another floor
 *  - onAdopt:          one-time effects and messages when it arrives here
 *  - notes:            the shrine preview's personal notes
 *
 * Modules don't import the engine at runtime; they act through RuleHost and
 * the `make` function they're handed, so there are no import cycles.
 */
import { BALANCE as B } from '../engine/balance.ts';
import type { GenCtx } from '../engine/content.ts';
import type { Item, ItemKind, Player, RuleId, RunState, Tone } from '../engine/types.ts';
import type { Lexicon } from '../theme/lexicon.ts';
import { alt, has, weightOf, type Derived, type RuleCtx } from './ctx.ts';

export const BASE_HP = B.player.hp;
export const BASE_STAT = 3;
export const MAX_SATIETY = B.hunger.maxSatiety;

/** What a rule module may do to a game in progress. Implemented by Game. */
export interface RuleHost {
  readonly run: RunState;
  readonly ctx: RuleCtx;
  readonly stats: Derived;
  readonly lex: Lexicon;
  log(text: string, tone?: Tone): void;
  /** Scatter this rule's loot over the current floor. */
  spawnLoot(rule: RuleId): void;
  /** Bring foes onto the current floor, at least `minDistance` from the player. */
  spawnFoes(fraction: number, minDistance: number): void;
  /** Open a single-room floor into its full layout. */
  expandFloor(): void;
}

export interface NoteCtx {
  p: Player;
  ctx: RuleCtx;
  lex: Lexicon;
  glimmers: number;
  monsters: number;
  /** The player's weapons and armour, equipped or carried. */
  arms: Item[];
}

export type Make = (kind: ItemKind, depth: number, g: GenCtx) => Item;

export interface RuleModule {
  id: RuleId;
  tier: number;
  prereqs: RuleId[];
  /** Never drafted: it arrives on its own once emerged. */
  imposed?: boolean;
  /** An exclusive group (an axiom family): at most one of its members per world. */
  group?: string;
  derive?(d: Derived, p: Player, ctx: RuleCtx): void;
  loot?(depth: number, g: GenCtx, make: Make): Item[];
  reinterpretFloor?(host: RuleHost): void;
  onAdopt?(host: RuleHost): void;
  notes?(n: NoteCtx): string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const MODULES: Record<RuleId, RuleModule> = {
  halls: {
    id: 'halls',
    tier: 1,
    prereqs: [],
    reinterpretFloor: (h) => h.expandFloor(),
    notes: ({ lex }) => [lex.t('note.halls')],
  },
  peril: {
    id: 'peril',
    tier: 1,
    prereqs: [],
    reinterpretFloor: (h) => h.spawnFoes(0.6, 3),
    onAdopt: (h) => h.log(h.lex.t('adopt.peril'), 'bad'),
    notes: ({ lex }) => [lex.t('note.peril')],
  },
  things: {
    id: 'things',
    tier: 1,
    prereqs: [],
    loot: (depth, g, make) => {
      const out: Item[] = [];
      const potions = g.rng.int(...B.loot.potionsPerFloor);
      for (let i = 0; i < potions; i++) out.push(make('potion', depth, g));
      const gold = g.rng.int(...B.loot.goldPilesPerFloor);
      for (let i = 0; i < gold; i++) out.push(make('gold', depth, g));
      return out;
    },
    reinterpretFloor: (h) => h.spawnLoot('things'),
    onAdopt: (h) => h.log(h.lex.t('adopt.things'), 'dim'),
    notes: ({ lex }) => [lex.t('note.things')],
  },
  growth: {
    id: 'growth',
    tier: 2,
    prereqs: ['peril'],
    derive: (d, p) => {
      d.maxHp += (p.vit - BASE_STAT) * 4 + (p.level - 1) * 2;
      d.attack += p.str - BASE_STAT;
      d.hit = clamp(0.85 + 0.03 * (p.agi - BASE_STAT), 0.5, 0.98);
      d.enemyHit = clamp(0.8 - 0.04 * (p.agi - BASE_STAT), 0.3, 0.95);
    },
    notes: ({ lex }) => [lex.t('note.growth')],
  },
  arms: {
    id: 'arms',
    tier: 2,
    prereqs: ['things', 'peril'],
    derive: (d, p) => {
      d.attack += -1 + (p.weapon?.atk ?? 0);
      d.defense += p.armor?.def ?? 0;
    },
    loot: (depth, g, make) => {
      const out: Item[] = [];
      const n = alt(g.ctx, 'arms') ? 2 : 1;
      for (let i = 0; i < n; i++) {
        if (g.rng.chance(B.loot.weaponChance)) out.push(make('weapon', depth, g));
        if (g.rng.chance(B.loot.armorChance)) out.push(make('armor', depth, g));
      }
      return out;
    },
    reinterpretFloor: (h) => h.spawnLoot('arms'),
    notes: ({ lex }) => [lex.t('note.arms')],
  },
  durability: {
    id: 'durability',
    tier: 3,
    prereqs: ['arms'],
    derive: (d, p) => {
      if (p.weapon) d.attack += 2;
      if (p.armor) d.defense += 1;
    },
    notes: ({ lex, arms }) => [
      ...(arms.length ? [] : [lex.t('note.carry.none')]),
      ...arms.map((it) => lex.t('note.durability.item', { item: it.name, n: it.dur })),
    ],
  },
  weight: {
    id: 'weight',
    tier: 3,
    prereqs: ['arms'],
    derive: (d, p, ctx) => {
      if (p.weapon) {
        const w = weightOf(p.weapon, ctx);
        if (w > p.str) d.attackCost = 2;
        else d.stagger = Math.min(0.6, w * 0.08);
      }
      if (p.armor) {
        const w = weightOf(p.armor, ctx);
        if (w > p.str) d.moveCost = 2;
        else d.defense += Math.floor(w / 3);
      }
    },
    notes: ({ lex, arms, p, ctx }) => [
      ...(arms.length ? [] : [lex.t('note.carry.none')]),
      ...arms.map((it) => {
        const w = weightOf(it, ctx);
        const verdict =
          w <= p.str ? lex.t('note.weight.ok') : lex.t(it.kind === 'weapon' ? 'note.weight.heavy.weapon' : 'note.weight.heavy.armor');
        return lex.t('note.weight.item', { item: it.name, w, str: p.str, verdict });
      }),
    ],
  },
  elements: {
    id: 'elements',
    tier: 3,
    prereqs: ['arms'],
    onAdopt: (h) => {
      const n = Object.keys(h.run.floor.glimmer).length;
      if (n) h.log(h.lex.t('adopt.elements', { n }), 'dim');
    },
    notes: ({ lex, arms, glimmers }) => {
      const el = arms.filter((i) => i.element);
      const out = el.map((it) =>
        lex.t('note.elements.item', {
          item: it.name,
          el: lex.element(it.element!).adj,
          opp: lex.element(it.element === 'ember' ? 'frost' : 'ember').adj,
        }),
      );
      if (arms.length && !el.length) out.push(lex.t('note.elements.none'));
      if (glimmers) out.push(lex.t('note.elements.glimmers', { n: glimmers }));
      return out;
    },
  },
  darkness: {
    id: 'darkness',
    tier: 3,
    prereqs: ['peril'],
    derive: (d, _p, ctx) => {
      d.sight = alt(ctx, 'darkness') ? 3 : 5;
      d.sneak = 2;
    },
    reinterpretFloor: (h) => {
      for (const m of h.run.monsters) m.aware = false;
    },
    onAdopt: (h) => h.run.floor.explored.fill(0),
    notes: ({ lex, monsters }) => (monsters ? [lex.t('note.darkness', { n: monsters })] : []),
  },
  hunger: {
    id: 'hunger',
    tier: 3,
    prereqs: ['things', 'peril'],
    derive: (d) => {
      d.regen = true;
    },
    loot: (depth, g, make) => {
      const out: Item[] = [];
      for (let i = 0; i < B.food.perFloor; i++) out.push(make('food', depth, g));
      if (g.rng.chance(B.food.extraChance)) out.push(make('food', depth, g));
      return out;
    },
    reinterpretFloor: (h) => h.spawnLoot('hunger'),
    onAdopt: (h) => {
      h.run.player.satiety = MAX_SATIETY;
    },
    notes: ({ lex }) => [lex.t('note.hunger', { n: MAX_SATIETY })],
  },
  arcana: {
    id: 'arcana',
    tier: 4,
    prereqs: ['growth'],
    derive: (d, p) => {
      d.maxMana = 3 + p.level;
      d.maxHp -= 4;
    },
    onAdopt: (h) => {
      h.run.player.mana = h.stats.maxMana;
    },
    notes: ({ lex, p }) => [lex.t('note.arcana', { cleave: B.arcana.cleaveCost, mend: B.arcana.mendCost, n: 3 + p.level })],
  },
  bestiary: {
    id: 'bestiary',
    tier: 3,
    // Goblins wear armour; meeting them with nothing but fists is a death sentence.
    prereqs: ['peril', 'growth'],
    imposed: true,
  },
};

/** Numbers before any rule applies. */
export function baseDerived(ctx: RuleCtx): Derived {
  return {
    maxHp: ctx.variants.peril === 'alt' ? B.player.frailHp : BASE_HP,
    attack: 2,
    defense: 0,
    hit: 1,
    enemyHit: 1,
    attackCost: 1,
    moveCost: 1,
    stagger: 0,
    sight: Infinity,
    sneak: 1,
    maxMana: 0,
    regen: false,
  };
}

export { has };
