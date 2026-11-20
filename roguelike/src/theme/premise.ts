/**
 * Premises: the phenotype layer. A premise supplies every word, name, glyph and
 * colour a player sees; the engine supplies behaviour. See ROADMAP.md §1.
 *
 * Genotype ids (foe kinds like `rat`, elements `ember`/`frost`, rule ids) are
 * internal and keep their original names for save compatibility. Only the
 * premise decides what a player is shown.
 */
import type { Element, MonsterKind, RuleId } from '../engine/types.ts';
import type { MessageKey } from './old-stone.ts';

export type PremiseId = 'old-stone';

export interface FoeLook {
  /** Lower-case, as it appears mid-sentence ("The rat hits you"). */
  name: string;
  glyph: string;
  color: string;
}

export interface ElementLook {
  /** Lower-case adjective: "ember rat". */
  adj: string;
  /** Capitalised: "Ember Greatsword", "Ember stone". */
  Adj: string;
  color: string;
  /** Tile tint when the hazard is active. */
  tint: string;
  /** Glyph of the active hazard tile. */
  glyph: string;
  /** Colour of the dormant (pre-Elements) stone. */
  dormant: string;
}

export interface RuleText {
  name: string;
  tagline: string;
  summary: string;
  upside: string;
  downside: string;
  /** Another way the rule can arrive, if any (Things: "Also arrives on your fifth kill."). */
  earned?: string;
  /** For imposed rules: how they arrive. */
  imposed?: string;
  variant: { name: string; text: string };
}

export interface Premise {
  id: PremiseId;
  /** The premise's own name ("The Old Stone"). */
  name: string;
  pitch: string;
  foes: Record<MonsterKind, FoeLook>;
  elements: Record<Element, ElementLook>;
  items: {
    restorative: string;
    currency: string;
    /** Index-aligned with BALANCE.food.kinds. */
    foods: string[];
    /** Index-aligned with WEAPONS and ARMORS in content.ts. */
    weapons: string[];
    armors: string[];
  };
  /** Rule texts are templates; {vars} come from balance (see lexicon.ts). */
  rules: Record<RuleId, RuleText>;
  naming: {
    worldAdjectives: string[];
    worldNouns: string[];
    /** Template with {adj} and {noun}. */
    world: string;
    heirs: string[];
  };
  /** Every message, label and line the game shows that belongs to the world. */
  text: Record<MessageKey, string>;
}
