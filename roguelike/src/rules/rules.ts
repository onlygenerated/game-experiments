import { BALANCE } from '../engine/balance.ts';
import type { Item, Player, RuleId, World } from '../engine/types.ts';

export interface RuleVariant {
  name: string;
  text: string;
}

export interface RuleDef {
  id: RuleId;
  name: string;
  tier: number;
  prereqs: RuleId[];
  tagline: string;
  /** What the rule does, mechanically. */
  summary: string;
  upside: string;
  downside: string;
  /** Rules the world imposes on its own once they emerge, rather than being drafted. */
  imposed?: string;
  /** Another way the rule can arrive besides a shrine. */
  earned?: string;
  /** The alternate form a world may roll for this rule. */
  variant: RuleVariant;
}

export const RULES: Record<RuleId, RuleDef> = {
  halls: {
    id: 'halls',
    name: 'Halls',
    tier: 1,
    prereqs: [],
    tagline: 'The walls fall away.',
    summary: 'Floors grow from a single room into many rooms joined by corridors.',
    upside: 'More floor holds more to find.',
    downside: 'The stairs are no longer in plain sight.',
    variant: { name: 'Sprawl', text: 'Floors have up to three more rooms.' },
  },
  peril: {
    id: 'peril',
    name: 'Peril',
    tier: 1,
    prereqs: [],
    tagline: 'Something else is down here.',
    summary: 'Rats appear. You have HP; walk into a rat to fight it. If you die, an heir carries on.',
    upside: 'Foes open the way to Growth, Arms, Darkness and Hunger.',
    downside: 'You can be hurt, and you can die.',
    variant: { name: 'Frail', text: `Max HP ${BALANCE.player.frailHp} instead of ${BALANCE.player.hp}.` },
  },
  things: {
    id: 'things',
    name: 'Things',
    tier: 1,
    prereqs: [],
    tagline: 'The dungeon begins to hold objects.',
    summary: 'Potions and gold appear. You carry what you find.',
    upside: 'Healing potions; foes drop coin.',
    downside: 'Nothing yet. This one is a gift.',
    earned: 'Also arrives on your fifth kill.',
    variant: { name: 'Generous Springs', text: 'Potions heal half again as much.' },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tier: 2,
    prereqs: ['peril'],
    tagline: 'You become someone.',
    summary: 'XP and levels. STR adds damage, AGI aids hitting and dodging, VIT adds HP.',
    upside: 'Choose a stat each level; HP grows.',
    downside: 'You can miss now. Foes grow faster with depth.',
    variant: { name: 'Quick Study', text: 'Levels need 30% less XP.' },
  },
  arms: {
    id: 'arms',
    name: 'Arms',
    tier: 2,
    prereqs: ['things', 'peril'],
    tagline: 'Steel enters the world.',
    summary: 'Weapons and armour appear and can be equipped.',
    upside: 'Weapons add attack, armour subtracts damage taken.',
    downside: 'Bare fists weaken (2 → 1).',
    variant: { name: 'Smithworld', text: 'Twice as many arms appear.' },
  },
  weight: {
    id: 'weight',
    name: 'Weight',
    tier: 3,
    prereqs: ['arms'],
    tagline: 'Steel has heft.',
    summary: 'Arms weigh what they weigh. Your STR decides what you can wield.',
    upside: 'A weapon within your STR staggers foes (weight × 8%). Armour within STR absorbs +1 per 3 weight.',
    downside: 'Weapon heavier than STR: attacks take 2 turns. Armour heavier than STR: moving takes 2 turns.',
    variant: { name: 'Iron World', text: 'Everything weighs 1 more.' },
  },
  durability: {
    id: 'durability',
    name: 'Durability',
    tier: 3,
    prereqs: ['arms'],
    tagline: 'Everything wears.',
    summary: 'Arms lose durability with use and shatter at zero.',
    upside: 'Honed edges: weapons +2 attack, armour +1 defense. A shattering weapon strikes for triple.',
    downside: 'Your gear will break.',
    variant: { name: 'Brittle Steel', text: 'Arms wear twice as fast.' },
  },
  elements: {
    id: 'elements',
    name: 'Elements',
    tier: 3,
    prereqs: ['arms'],
    tagline: 'The glimmering stones awaken.',
    summary: 'Ember and frost. Elemental weapons and foes; ember stones burn, frost stones freeze.',
    upside: 'Elemental weapons deal double to the opposite element. Lure foes onto stones.',
    downside: 'Stones hurt you too. Same-element foes take half.',
    variant: { name: 'Wildfire', text: `Ember stones burn for ${BALANCE.elements.wildfireBurn} instead of ${BALANCE.elements.emberBurn}.` },
  },
  darkness: {
    id: 'darkness',
    name: 'Darkness',
    tier: 3,
    prereqs: ['peril'],
    tagline: 'The lights go out.',
    summary: 'You see only nearby. Foes notice you only up close.',
    upside: 'Unaware foes take double damage. Every foe loses track of you now.',
    downside: 'You can no longer see the whole floor.',
    variant: { name: 'Moonless', text: 'Sight radius 3 instead of 5.' },
  },
  hunger: {
    id: 'hunger',
    name: 'Hunger',
    tier: 3,
    prereqs: ['things', 'peril'],
    tagline: 'You must eat.',
    summary: 'Satiety drains each turn. Food appears.',
    upside: `While at least ${Math.round(BALANCE.hunger.regenAbove * 100)}% fed, regenerate 1 HP every ${BALANCE.hunger.regenEvery} turns. Nothing else regenerates.`,
    downside: `Satiety drains every turn; food is scarce. Starving costs 1 HP every ${BALANCE.hunger.starveEvery} turns.`,
    variant: { name: 'Lean Years', text: 'Satiety drains half again as fast.' },
  },
  arcana: {
    id: 'arcana',
    name: 'Arcana',
    tier: 4,
    prereqs: ['growth'],
    tagline: 'Power drawn from the body.',
    summary: `Mana (3 + level), regenerating slowly. Cleave (${BALANCE.arcana.cleaveCost}): strike every adjacent foe. Mend (${BALANCE.arcana.mendCost}): heal ${Math.round(BALANCE.arcana.mendFraction * 100)}%.`,
    upside: 'Two abilities.',
    downside: '−4 max HP.',
    variant: { name: 'Ley Lines', text: 'Mana regenerates twice as fast.' },
  },
  bestiary: {
    id: 'bestiary',
    name: 'Bestiary',
    tier: 3,
    // Goblins wear armour; meeting them with nothing but fists is a death sentence.
    prereqs: ['peril', 'growth'],
    tagline: 'The deep stirs.',
    summary: 'Bats (fast, erratic), goblins (armoured) and slimes (slow, tough) join the rats.',
    upside: 'More XP and more drops.',
    downside: 'More dangerous foes.',
    imposed: 'Never offered at shrines: it arrives on its own as you go deeper.',
    variant: { name: 'Swarming Deep', text: 'Two more foes per floor.' },
  },
};

/** Canonical order for applying rules: derived stats never depend on adoption order. */
export const RULE_ORDER: RuleId[] = [
  'halls',
  'peril',
  'things',
  'growth',
  'arms',
  'durability',
  'weight',
  'elements',
  'darkness',
  'hunger',
  'arcana',
  'bestiary',
];

export const MASTERY_KILLS = 5;

/**
 * The basic rules whose arrival each world rolls. Strategic rules (Weight,
 * Durability, Elements, Hunger, Arcana, Arms) are gated by prerequisites alone.
 */
export const EMERGENT: RuleId[] = ['halls', 'peril', 'things', 'growth', 'darkness', 'bestiary'];

export function emergenceOf(world: Pick<World, 'emergence'>, id: RuleId): number {
  return world.emergence?.[id] ?? 1;
}

export interface RuleCtx {
  rules: ReadonlySet<RuleId>;
  variants: Partial<Record<RuleId, 'base' | 'alt'>>;
}

export function ctxOf(world: Pick<World, 'rules' | 'variants'>): RuleCtx {
  return { rules: new Set(world.rules), variants: world.variants };
}

export function has(ctx: RuleCtx, id: RuleId): boolean {
  return ctx.rules.has(id);
}

/** True when the rule is active *and* this world rolled its alternate form. */
export function alt(ctx: RuleCtx, id: RuleId): boolean {
  return ctx.rules.has(id) && ctx.variants[id] === 'alt';
}

export function withRule(ctx: RuleCtx, id: RuleId): RuleCtx {
  return { rules: new Set([...ctx.rules, id]), variants: ctx.variants };
}

/**
 * Inactive, draftable rules whose prerequisites are all active. With an
 * emergence table and a depth, only rules that have shown themselves by then.
 */
export function frontier(
  active: ReadonlySet<RuleId>,
  at?: { depth: number; emergence: World['emergence'] },
): RuleId[] {
  return RULE_ORDER.filter(
    (id) =>
      !active.has(id) &&
      !RULES[id].imposed &&
      RULES[id].prereqs.every((p) => active.has(p)) &&
      (!at || (at.emergence[id] ?? 1) <= at.depth),
  );
}

/** A rule can be repealed only if no other active rule depends on it. */
export function repealable(active: ReadonlySet<RuleId>): RuleId[] {
  return RULE_ORDER.filter(
    (id) => active.has(id) && ![...active].some((o) => RULES[o].prereqs.includes(id)),
  );
}

// ---------------------------------------------------------------------------
// Derived stats: a pure function of the character and the active rules. The
// shrine preview is derive(with candidate) − derive(without).
// ---------------------------------------------------------------------------

export interface Derived {
  maxHp: number;
  attack: number;
  defense: number;
  /** Your chance to hit. 1 until Growth introduces misses. */
  hit: number;
  /** Foes' chance to hit you. */
  enemyHit: number;
  attackCost: number;
  moveCost: number;
  stagger: number;
  /** Sight radius; Infinity means the whole floor is lit. */
  sight: number;
  sneak: number;
  maxMana: number;
  regen: boolean;
}

export const BASE_HP = BALANCE.player.hp;
export const BASE_STAT = 3;
export const MAX_SATIETY = BALANCE.hunger.maxSatiety;

export function weightOf(item: Item, ctx: RuleCtx): number {
  return item.weight + (ctx.variants.weight === 'alt' ? 1 : 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function derive(p: Player, ctx: RuleCtx): Derived {
  const d: Derived = {
    maxHp: ctx.variants.peril === 'alt' ? BALANCE.player.frailHp : BASE_HP,
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
  if (has(ctx, 'growth')) {
    d.maxHp += (p.vit - BASE_STAT) * 4 + (p.level - 1) * 2;
    d.attack += p.str - BASE_STAT;
    d.hit = clamp(0.85 + 0.03 * (p.agi - BASE_STAT), 0.5, 0.98);
    d.enemyHit = clamp(0.8 - 0.04 * (p.agi - BASE_STAT), 0.3, 0.95);
  }
  if (has(ctx, 'arms')) {
    d.attack += -1 + (p.weapon?.atk ?? 0);
    d.defense += p.armor?.def ?? 0;
  }
  if (has(ctx, 'durability')) {
    if (p.weapon) d.attack += 2;
    if (p.armor) d.defense += 1;
  }
  if (has(ctx, 'weight')) {
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
  }
  if (has(ctx, 'darkness')) {
    d.sight = alt(ctx, 'darkness') ? 3 : 5;
    d.sneak = 2;
  }
  if (has(ctx, 'hunger')) d.regen = true;
  if (has(ctx, 'arcana')) {
    d.maxMana = 3 + p.level;
    d.maxHp -= 4;
  }
  d.attack = Math.max(1, d.attack);
  return d;
}

// ---------------------------------------------------------------------------
// Shrine preview
// ---------------------------------------------------------------------------

type Better = 'higher' | 'lower';

const FIELDS: { key: keyof Derived; label: string; better: Better; fmt: (v: number) => string }[] = [
  { key: 'maxHp', label: 'Max HP', better: 'higher', fmt: String },
  { key: 'attack', label: 'Attack', better: 'higher', fmt: String },
  { key: 'defense', label: 'Defense', better: 'higher', fmt: String },
  { key: 'hit', label: 'Your hit chance', better: 'higher', fmt: pct },
  { key: 'enemyHit', label: 'Foe hit chance', better: 'lower', fmt: pct },
  { key: 'attackCost', label: 'Attack cost', better: 'lower', fmt: turns },
  { key: 'moveCost', label: 'Move cost', better: 'lower', fmt: turns },
  { key: 'stagger', label: 'Stagger chance', better: 'higher', fmt: pct },
  { key: 'sight', label: 'Sight', better: 'higher', fmt: (v) => (v === Infinity ? 'whole floor' : `${v} tiles`) },
  { key: 'sneak', label: 'Sneak attack', better: 'higher', fmt: (v) => (v === 1 ? '—' : `×${v}`) },
  { key: 'maxMana', label: 'Mana', better: 'higher', fmt: String },
];

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}
function turns(v: number) {
  return v === 1 ? '1 turn' : `${v} turns`;
}

export interface PreviewChange {
  label: string;
  from: string;
  to: string;
  good: boolean;
}

export interface Preview {
  changes: PreviewChange[];
  notes: string[];
}

export interface PreviewInfo {
  glimmers: number;
  monsters: number;
}

export function previewRule(p: Player, ctx: RuleCtx, id: RuleId, info: PreviewInfo): Preview {
  const before = derive(p, ctx);
  const nextCtx = withRule(ctx, id);
  const after = derive(p, nextCtx);
  const changes: PreviewChange[] = [];
  for (const f of FIELDS) {
    const a = before[f.key] as number;
    const b = after[f.key] as number;
    if (a === b) continue;
    changes.push({
      label: f.label,
      from: f.fmt(a),
      to: f.fmt(b),
      good: f.better === 'higher' ? b > a : b < a,
    });
  }
  return { changes, notes: ruleNotes(p, nextCtx, id, info) };
}

function ruleNotes(p: Player, ctx: RuleCtx, id: RuleId, info: PreviewInfo): string[] {
  const notes: string[] = [];
  const arms = [p.weapon, p.armor, ...p.inventory].filter(
    (i): i is Item => !!i && (i.kind === 'weapon' || i.kind === 'armor'),
  );
  switch (id) {
    case 'halls':
      notes.push('This floor opens up right away — and its stairs move somewhere you haven’t been.');
      break;
    case 'peril':
      notes.push('Rats will appear on this floor. Until now nothing here could touch you.');
      break;
    case 'things':
      notes.push('Objects will appear on this floor and every floor after.');
      break;
    case 'growth':
      notes.push('Your STR, AGI and VIT (all 3) start to matter. You are level 1.');
      break;
    case 'arms':
      notes.push('Weapons and armour will appear, starting on this floor.');
      break;
    case 'weight': {
      if (!arms.length) notes.push('You carry nothing it applies to — yet.');
      for (const it of arms) {
        const w = weightOf(it, ctx);
        const ok = w <= p.str;
        const role = it.kind === 'weapon' ? 'attacks' : 'moving';
        notes.push(
          `${it.name} weighs ${w} vs your STR ${p.str} — ${ok ? 'within your strength' : `too heavy: ${role} take 2 turns if equipped`}.`,
        );
      }
      break;
    }
    case 'durability':
      if (!arms.length) notes.push('You carry nothing it applies to — yet.');
      for (const it of arms) notes.push(`${it.name}: ${it.dur} uses before it shatters.`);
      break;
    case 'elements': {
      const el = arms.filter((i) => i.element);
      for (const it of el) {
        const opp = it.element === 'ember' ? 'frost' : 'ember';
        notes.push(`${it.name} is ${it.element}-touched: ×2 against ${opp} foes, ½ against ${it.element} foes.`);
      }
      if (arms.length && !el.length) notes.push('None of your arms carry an element.');
      if (info.glimmers) notes.push(`${info.glimmers} glimmering stones on this floor will awaken.`);
      break;
    }
    case 'darkness':
      if (info.monsters) notes.push(`All ${info.monsters} foes on this floor lose track of you.`);
      break;
    case 'hunger':
      notes.push(`You start fully fed (${MAX_SATIETY}).`);
      break;
    case 'arcana':
      notes.push(`Learn Cleave (2 mana) and Mend (3 mana). You start with ${3 + p.level} mana.`);
      break;
    case 'bestiary':
      break;
  }
  if (ctx.variants[id] === 'alt') notes.push(`This world: ${RULES[id].variant.name} — ${RULES[id].variant.text}`);
  return notes;
}

/** How many properties of this item are invisible under the current rules. */
export function hiddenProps(item: Item, ctx: RuleCtx): number {
  if (item.kind !== 'weapon' && item.kind !== 'armor') return 0;
  let n = 0;
  if (!has(ctx, 'weight')) n++;
  if (!has(ctx, 'durability')) n++;
  if (item.element && !has(ctx, 'elements')) n++;
  return n;
}
