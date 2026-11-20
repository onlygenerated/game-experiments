/**
 * Premises: the phenotype layer. A premise supplies every word, name, glyph and
 * colour a player sees; the engine supplies behaviour. See ROADMAP.md §1.
 *
 * Genotype ids (foe kinds like `rat`, elements `ember`/`frost`, rule ids) are
 * internal and keep their original names for save compatibility. Only the
 * premise decides what a player is shown.
 */
import type { Element, MonsterKind, RuleId } from '../engine/types.ts';
import type { MessageKey, Roles, ThemedKey } from './base.ts';

export type PremiseId =
  | 'old-stone'
  | 'plain'
  | 'merger'
  | 'overgrown-choir'
  | 'court-of-barbs'
  | 'tidepool'
  | 'ministry'
  | 'night-shift';

export interface FoeLook {
  /** Lower-case, as it appears mid-sentence ("The rat hits you"). */
  name: string;
  plural: string;
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
  /** Colour of the dormant (pre-Elements) tile. */
  dormant: string;
}

/**
 * A rule in a premise's words. Name, tagline, summary and variant name are the
 * premise's own; the mechanical lines default to BASE_RULE_TEXT.
 */
export interface RuleWords {
  name: string;
  tagline: string;
  summary: string;
  /** The name of this world's variant of the rule. */
  variant: string;
  upside?: string;
  downside?: string;
  variantText?: string;
  earned?: string;
  imposed?: string;
}

/** A rule's full text, as the UI shows it. */
export interface RuleText {
  name: string;
  tagline: string;
  summary: string;
  upside: string;
  downside: string;
  earned?: string;
  imposed?: string;
  variant: { name: string; text: string };
}

export interface Premise {
  id: PremiseId;
  /** The premise's own name ("The Merger"). */
  name: string;
  pitch: string;
  /** How things from other premises get in ("Unclaimed deliveries pile up in the mail room."). */
  seep: string;
  /** Relative chance a new world rolls this premise. 0 = never (The Plain vocabulary). */
  weight: number;
  /** Never takes in another premise's bundles: its texts name its own things outright. It may still lend them. */
  pure?: boolean;
  roles: Roles;
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
  /** Rule texts are templates over role words and balance numbers (see lexicon.ts). */
  rules: Record<RuleId, RuleWords>;
  naming: {
    worldAdjectives: string[];
    worldNouns: string[];
    /** Template with {adj} and {noun}. */
    world: string;
    heirs: string[];
    /** Names given to floors, picked per world and depth. May be empty. */
    floors: string[];
  };
  /** Signature lines (required) and any other base line it wants to say differently. */
  text: Record<ThemedKey, string> & Partial<Record<MessageKey, string>>;
}
