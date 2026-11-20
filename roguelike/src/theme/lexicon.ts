import { BALANCE } from '../engine/balance.ts';
import type { Element, MonsterKind, RuleId, World } from '../engine/types.ts';
import { OLD_STONE, type MessageKey } from './old-stone.ts';
import type { ElementLook, FoeLook, Premise, PremiseId, RuleText } from './premise.ts';

export type Vars = Record<string, string | number>;

export const PREMISES: Record<PremiseId, Premise> = {
  'old-stone': OLD_STONE,
};

export const DEFAULT_PREMISE: PremiseId = 'old-stone';

/**
 * Numbers rule texts may quote, taken from balance so the words never drift
 * from the behaviour.
 */
export const RULE_TEXT_VARS: Vars = {
  hp: BALANCE.player.hp,
  frailHp: BALANCE.player.frailHp,
  wildfireBurn: BALANCE.elements.wildfireBurn,
  emberBurn: BALANCE.elements.emberBurn,
  regenPct: Math.round(BALANCE.hunger.regenAbove * 100),
  regenEvery: BALANCE.hunger.regenEvery,
  starveEvery: BALANCE.hunger.starveEvery,
  cleaveCost: BALANCE.arcana.cleaveCost,
  mendCost: BALANCE.arcana.mendCost,
  mendPct: Math.round(BALANCE.arcana.mendFraction * 100),
};

/** Replace {name} placeholders. An unknown placeholder is left visible, and the premise tests catch it. */
export function fill(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

/** Every {placeholder} a template uses. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/** The words of one premise: what every role, rule and message is called in this world. */
export class Lexicon {
  readonly premise: Premise;
  private ruleCache = new Map<RuleId, RuleText>();

  constructor(premise: Premise) {
    this.premise = premise;
  }

  /** A message or label, filled in. */
  t(key: MessageKey, vars?: Vars): string {
    return fill(this.premise.text[key], vars);
  }

  /** A rule's name and texts in this world, with balance numbers filled in. */
  rule(id: RuleId): RuleText {
    let r = this.ruleCache.get(id);
    if (!r) {
      const raw = this.premise.rules[id];
      const f = (s: string) => fill(s, RULE_TEXT_VARS);
      r = {
        name: f(raw.name),
        tagline: f(raw.tagline),
        summary: f(raw.summary),
        upside: f(raw.upside),
        downside: f(raw.downside),
        earned: raw.earned && f(raw.earned),
        imposed: raw.imposed && f(raw.imposed),
        variant: { name: f(raw.variant.name), text: f(raw.variant.text) },
      };
      this.ruleCache.set(id, r);
    }
    return r;
  }

  foe(kind: MonsterKind): FoeLook {
    return this.premise.foes[kind];
  }

  element(el: Element): ElementLook {
    return this.premise.elements[el];
  }

  /** "a, b and c" in this premise's words. */
  list(parts: string[]): string {
    if (parts.length <= 1) return parts.join('');
    return this.t('list.and', { rest: parts.slice(0, -1).join(this.t('list.sep')), last: parts[parts.length - 1] });
  }

  /** "1 turn" / "N turns". */
  turns(n: number): string {
    return n === 1 ? this.t('turns.one') : this.t('turns.many', { n });
  }
}

const cache = new Map<PremiseId, Lexicon>();

export function lexiconOf(id: PremiseId): Lexicon {
  let lex = cache.get(id);
  if (!lex) {
    lex = new Lexicon(PREMISES[id] ?? PREMISES[DEFAULT_PREMISE]);
    cache.set(id, lex);
  }
  return lex;
}

/** The lexicon a world speaks in. */
export function lexiconFor(world: Pick<World, 'genome'>): Lexicon {
  return lexiconOf(world.genome?.premise ?? DEFAULT_PREMISE);
}
