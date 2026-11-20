/**
 * The rule graph and what rules do to a character. Behaviour lives in
 * modules.ts; every word a player sees lives in the world's premise.
 */
import type { Item, Player, RuleId, World } from '../engine/types.ts';
import type { Lexicon } from '../theme/lexicon.ts';
import type { MessageKey } from '../theme/old-stone.ts';
import { has, withRule, type Derived, type RuleCtx } from './ctx.ts';
import { baseDerived, MODULES, type RuleModule } from './modules.ts';

export { alt, ctxOf, has, weightOf, withRule } from './ctx.ts';
export type { Derived, RuleCtx } from './ctx.ts';
export { BASE_HP, BASE_STAT, MAX_SATIETY, MODULES } from './modules.ts';

/** Every rule's genotype: tier, prerequisites, group, and hooks. */
export const RULES: Record<RuleId, RuleModule> = MODULES;

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

/**
 * Could this rule enter a world with these rules active? Its prerequisites must
 * all be active, no other member of its exclusive group may be, and it must be
 * in the world's pool (null = every rule).
 */
export function eligible(id: RuleId, active: ReadonlySet<RuleId>, pool?: readonly RuleId[] | null): boolean {
  const def = RULES[id];
  if (active.has(id)) return false;
  if (!def.prereqs.every((p) => active.has(p))) return false;
  if (def.group && [...active].some((o) => o !== id && RULES[o].group === def.group)) return false;
  return !pool || pool.includes(id);
}

/**
 * Inactive, draftable rules that could be adopted now. With an emergence table
 * and a depth, only rules that have shown themselves by then.
 */
export function frontier(
  active: ReadonlySet<RuleId>,
  at?: { depth: number; emergence: World['emergence']; pool?: readonly RuleId[] | null },
): RuleId[] {
  return RULE_ORDER.filter(
    (id) =>
      !RULES[id].imposed &&
      eligible(id, active, at?.pool) &&
      (!at || (at.emergence[id] ?? 1) <= at.depth),
  );
}

/** A rule can be repealed only if no other active rule depends on it. Axioms (grouped rules) never can. */
export function repealable(active: ReadonlySet<RuleId>): RuleId[] {
  return RULE_ORDER.filter(
    (id) => active.has(id) && !RULES[id].group && ![...active].some((o) => RULES[o].prereqs.includes(id)),
  );
}

// ---------------------------------------------------------------------------
// Derived stats: a pure function of the character and the active rules. The
// shrine preview is derive(with candidate) − derive(without).
// ---------------------------------------------------------------------------

export function derive(p: Player, ctx: RuleCtx): Derived {
  const d = baseDerived(ctx);
  for (const id of RULE_ORDER) if (has(ctx, id)) RULES[id].derive?.(d, p, ctx);
  d.attack = Math.max(1, d.attack);
  return d;
}

// ---------------------------------------------------------------------------
// Shrine preview
// ---------------------------------------------------------------------------

type Better = 'higher' | 'lower';

const FIELDS: { key: keyof Derived; label: MessageKey; better: Better; fmt: (v: number, lex: Lexicon) => string }[] = [
  { key: 'maxHp', label: 'preview.maxHp', better: 'higher', fmt: String },
  { key: 'attack', label: 'preview.attack', better: 'higher', fmt: String },
  { key: 'defense', label: 'preview.defense', better: 'higher', fmt: String },
  { key: 'hit', label: 'preview.hit', better: 'higher', fmt: pct },
  { key: 'enemyHit', label: 'preview.enemyHit', better: 'lower', fmt: pct },
  { key: 'attackCost', label: 'preview.attackCost', better: 'lower', fmt: (v, lex) => lex.turns(v) },
  { key: 'moveCost', label: 'preview.moveCost', better: 'lower', fmt: (v, lex) => lex.turns(v) },
  { key: 'stagger', label: 'preview.stagger', better: 'higher', fmt: pct },
  { key: 'sight', label: 'preview.sight', better: 'higher', fmt: (v, lex) => (v === Infinity ? lex.t('sight.all') : lex.t('sight.n', { n: v })) },
  { key: 'sneak', label: 'preview.sneak', better: 'higher', fmt: (v, lex) => (v === 1 ? lex.t('sneak.none') : lex.t('sneak.mult', { n: v })) },
  { key: 'maxMana', label: 'preview.maxMana', better: 'higher', fmt: String },
];

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
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

export function previewRule(p: Player, ctx: RuleCtx, id: RuleId, info: PreviewInfo, lex: Lexicon): Preview {
  const before = derive(p, ctx);
  const nextCtx = withRule(ctx, id);
  const after = derive(p, nextCtx);
  const changes: PreviewChange[] = [];
  for (const f of FIELDS) {
    const a = before[f.key] as number;
    const b = after[f.key] as number;
    if (a === b) continue;
    changes.push({
      label: lex.t(f.label),
      from: f.fmt(a, lex),
      to: f.fmt(b, lex),
      good: f.better === 'higher' ? b > a : b < a,
    });
  }
  const arms = [p.weapon, p.armor, ...p.inventory].filter(
    (i): i is Item => !!i && (i.kind === 'weapon' || i.kind === 'armor'),
  );
  const notes = RULES[id].notes?.({ p, ctx: nextCtx, lex, arms, ...info }) ?? [];
  if (nextCtx.variants[id] === 'alt') {
    const r = lex.rule(id);
    notes.push(lex.t('note.variant', { name: r.variant.name, text: r.variant.text }));
  }
  return { changes, notes };
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
