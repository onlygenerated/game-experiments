import type { Config } from '../config';
import type { Card } from '../deck';

/** One line of the score breakdown, e.g. "Fifteens ×3" worth 6. */
export interface ScoreItem {
  label: string;
  points: number;
}

/** What one line of cards is worth, plus the itemisation the preview shows. */
export interface LineEval {
  /** Headline, e.g. "Two Pair" or "8 pts". */
  name: string;
  items: ScoreItem[];
  /** Points this line contributes to the placement's score. */
  value: number;
}

/** One rule, as the player reads it. */
export interface RuleLine {
  label: string;
  detail: string;
  /** Worked example, where one says it faster than a sentence. */
  example?: string;
}

export interface RuleSection {
  title: string;
  lines: RuleLine[];
}

export interface Lens {
  id: string;
  name: string;
  /** One line, shown in the ruleset menu. */
  blurb: string;
  evaluate(cards: readonly Card[], cfg: Config): LineEval;
  /**
   * How this lens scores, in the player's terms and with this config's actual
   * numbers in it. Lives on the lens so the explanation cannot drift from the
   * implementation the way a hand-written rules page would.
   */
  rules(cfg: Config): RuleSection[];
}

/**
 * A scored line, normalised so the preview and the board views never need to
 * know whether they are looking at a square grid or a hex sprawl.
 *
 * Coordinates travel as opaque cell keys — "r,c" on a grid, "q,r" on hexes —
 * because the only thing a view does with them is set membership for
 * highlighting.
 */
export interface ScoredLine {
  /** Shown in the preview, e.g. "Row" or "E-W". */
  label: string;
  /** The whole contiguous run, for highlighting. */
  cards: Card[];
  cellKeys: string[];
  /** The stretch that actually scored. Same as cellKeys when uncapped lines are off. */
  windowKeys: string[];
  result: LineEval;
  value: number;
}

/** What a placement is worth, structure-agnostic: the sum of its lines. */
export interface ScoredPlacement {
  card: Card;
  lines: ScoredLine[];
  score: number;
  /** Structure-specific extras shown under the total, e.g. a distance bonus. */
  notes: ScoreItem[];
}
