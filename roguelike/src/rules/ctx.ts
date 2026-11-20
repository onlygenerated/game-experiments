/** The small shared vocabulary every rule module and the engine use to ask "which rules are on?". */
import type { Item, Player, RuleId, World } from '../engine/types.ts';
import type { HarmId } from './harm.ts';

export interface RuleCtx {
  rules: ReadonlySet<RuleId>;
  variants: Partial<Record<RuleId, 'base' | 'alt'>>;
  /** How harm works here. A world that hasn't settled it yet strikes, for want of anything else. */
  harm: HarmId;
}

export function ctxOf(world: Pick<World, 'rules' | 'variants'> & { genome?: World['genome'] }): RuleCtx {
  return { rules: new Set(world.rules), variants: world.variants, harm: world.genome?.axioms.harm ?? 'strike' };
}

export function has(ctx: RuleCtx, id: RuleId): boolean {
  return ctx.rules.has(id);
}

/** True when the rule is active *and* this world rolled its alternate form. */
export function alt(ctx: RuleCtx, id: RuleId): boolean {
  return ctx.rules.has(id) && ctx.variants[id] === 'alt';
}

export function withRule(ctx: RuleCtx, id: RuleId): RuleCtx {
  return { rules: new Set([...ctx.rules, id]), variants: ctx.variants, harm: ctx.harm };
}

export function weightOf(item: Item, ctx: RuleCtx): number {
  return item.weight + (ctx.variants.weight === 'alt' ? 1 : 0);
}

/** Numbers the active rules make out of a character. */
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
  /** How far aimed harm reaches (1 under Strike). */
  range: number;
}

export type { Player };
