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
  /** The number this line contributes in its role — chips or mult. */
  value: number;
}

/**
 * Which resource a line feeds. The spine of the game never changes — place a
 * card, it joins lines, the lines score — so a lens only decides how a line of
 * cards converts into chips or mult.
 */
export type AxisRole = 'chips' | 'mult';

export interface Lens {
  id: string;
  name: string;
  /** One line, shown in the ruleset menu. */
  blurb: string;
  evaluate(cards: readonly Card[], role: AxisRole, cfg: Config): LineEval;
}
