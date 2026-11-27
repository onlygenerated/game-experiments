/**
 * Premises: the phenotype layer. A premise supplies every word, name, glyph and
 * colour a player sees; the engine supplies behaviour. See ROADMAP.md §1.
 *
 * Genotype ids (foe kinds like `rat`, elements `ember`/`frost`, rule ids) are
 * internal and keep their original names for save compatibility. Only the
 * premise decides what a player is shown.
 */
import type { Element, MonsterKind, RuleId, SpaceId, TimeId } from '../engine/types.ts';
import type { HarmId } from '../rules/harm.ts';
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

/**
 * How a premise expresses one Means of Harm. Under Strike only the name and
 * lines are needed (its role words and lines are the premise's own); every
 * other means re-words what you harm with (MEANS_ROLES), names the implements,
 * and writes its combat lines (MEANS_THEMED_KEYS).
 */
export interface MeansWords {
  name: string;
  tagline: string;
  summary: string;
  roles?: Partial<Roles>;
  /** Implements under this means, index-aligned with WEAPONS in content.ts. */
  weapons?: string[];
  text?: Partial<Record<MessageKey, string>>;
}

/** How a premise names one option of Shape of Space or Flow of Time (Phase 3). */
export interface AxiomWords {
  name: string;
  tagline: string;
  summary: string;
}

/** A Means of Harm's full text, as the UI shows it. */
export interface MeansText {
  name: string;
  tagline: string;
  summary: string;
  upside: string;
  downside: string;
}

/**
 * How a premise's floors look: palette, floor pattern and a light scatter of
 * cosmetic decorations. Nothing here touches play; decorations are never
 * items, never block, and are drawn faintly so they can't be mistaken for things.
 */
export interface Tileset {
  /** Outside the map. */
  void: string;
  floor: string;
  /** A second floor shade for a checkerboard (carpet tiles, marble). */
  floorAlt?: string;
  /** The small mark on plain floor, and its colour. */
  dot: string;
  dotColor: string;
  wall: string;
  /** The lit top edge of a wall above a floor. */
  wallEdge: string;
  /** Scattered decorations, picked per tile by a fixed hash. */
  decor: { glyph: string; color: string }[];
  /** Fraction of plain floor tiles that carry one. */
  density: number;
  /** The colour headlines and toasts are set in. */
  accent: string;
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
  /** Each Means of Harm in this premise's words. */
  means: Record<HarmId, MeansWords>;
  /** Shape of Space and Flow of Time in this premise's words. */
  space: Record<SpaceId, AxiomWords>;
  time: Record<TimeId, AxiomWords>;
  /** How its floors look. */
  tiles: Tileset;
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
