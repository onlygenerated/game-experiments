/**
 * Every tunable number in the prototype lives here. Nothing else should hold a
 * magic constant. If a playtest says "the math feels bad", the fix belongs in
 * this file, not in board.ts or hands.ts.
 */

export type HandName =
  | 'High Card'
  | 'Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush';

export interface HandEntry {
  /** Fewest cards a line needs before this hand can be detected at all. */
  minCards: number;
  chips: number;
  mult: number;
}

export interface Config {
  /** Board is gridSize x gridSize. */
  gridSize: number;
  /** A contiguous run may never exceed this. A run at the cap is "complete". */
  lineCap: number;

  targetScore: number;
  placementsPerRun: number;
  discardsPerRun: number;

  handSize: number;
  minDiscardSelection: number;
  maxDiscardSelection: number;

  /** rank 2..14 (11=J, 12=Q, 13=K, 14=A) -> chip value */
  rankChips: Record<number, number>;

  hands: Record<HandName, HandEntry>;

  /** Which scoring lens converts a line of cards into chips or mult. */
  lensId: string;

  /** Board topology. 'grid' is the square board; 'hex' is the sprawl. */
  structure: 'grid' | 'hex';

  /** Hex structures only: how many rings out the playable area extends. */
  hexRadius: number;
  /**
   * Hex structures only: longest stretch of a line that scores. Lines are
   * uncapped, so the best window stands in for the old length cap.
   */
  hexWindow: number;
  /** Hex structures only: score x (1 + ring * this). Rewards building outward. */
  hexRingBonus: number;

  /**
   * Whether a card is dealt to the centre before play. With it off the board
   * starts empty and the first placement picks the origin, which is what any
   * open-ended sprawl needs.
   */
  startWithAnchor: boolean;

  /**
   * Category-2 mechanic variants. These change how a placement scores, not
   * what the numbers are, so they are read by `scorePlacement` and the
   * legality check rather than by a lens. Each one exists to falsify a
   * specific assumption the PRD baked in without testing.
   *
   * `axisMode` and `payOnCompleteOnly` are grid-only. The hex sprawl has three
   * axes and uncapped lines, so "the two axes" and "complete" have no meaning
   * there; hex rulesets leave them at the defaults.
   */
  mechanics: {
    /**
     * How the two axes map onto the two resources.
     *
     * 'split' — row feeds chips, col feeds mult. The PRD default.
     * 'both'  — every line feeds both. If this plays the same, the axis split
     *           is decoration rather than the source of positional tension.
     * 'suit'  — the placed card's suit decides which axis feeds which, moving
     *           the decision from *where* to play to *what* to play.
     */
    axisMode: 'split' | 'both' | 'suit';
    /**
     * Lines pay only on reaching the cap; a placement that completes neither
     * line banks nothing. Tests whether scoring every single placement is what
     * makes the loop satisfying, or whether deferred payoff reads as tension.
     */
    payOnCompleteOnly: boolean;
    /**
     * Placements must touch an existing card. Off means play anywhere on the
     * board, which is the cleanest test of whether adjacency is what makes
     * this a puzzle rather than a sequence of independent draws.
     */
    requireAdjacency: boolean;
    /**
     * Placements bank nothing on their own. Instead you cash a cross — its
     * chips x mult — which locks both of its lines against ever being extended
     * or cashed again, and which costs one action from the same budget as a
     * placement. So every cash is a card you did not play, and every card you
     * play is a cross that has not been banked yet. Anything left uncashed when
     * the actions run out is worth nothing.
     *
     * Grid-only, like the two above.
     */
    lockAndCash: boolean;
  };

  /**
   * Cribbage lens. The count is additive, so these rates decide how fast a
   * growing structure runs away with the score.
   */
  cribbage: {
    /** chips = count x this */
    chipsPerPoint: number;
    /**
     * Flat chips per card in the line, before the count. Without this a line
     * with no count scores literally zero, so half of every turn's moves are
     * worth nothing and a placement can be a wasted turn.
     */
    baseChipsPerCard: number;
    /** mult = 1 + floor(count / this) */
    multPerPoint: number;
    /** Shortest all-one-suit line that counts as a flush. Cribbage uses 4. */
    flushMin: number;
  };

  /**
   * Open tuning question from the PRD. With a 5-card cap, true straights and
   * flushes are rare, which risks a dead mult axis. Flip `enabled` to true to
   * let a line that is *entirely* a 3- or 4-card straight/flush score at a
   * reduced rate. That is the one-line change.
   */
  partialHands: {
    enabled: boolean;
    /** Shortest line length that can register as a straight/flush when enabled. */
    minCards: number;
    /** line length -> multiplier applied to that hand's chips and mult. */
    scaleByLength: Record<number, number>;
  };
}

export const CONFIG: Config = {
  gridSize: 7,
  lineCap: 5,

  targetScore: 300,
  placementsPerRun: 15,
  discardsPerRun: 3,

  handSize: 7,
  minDiscardSelection: 1,
  maxDiscardSelection: 5,

  lensId: 'poker',
  startWithAnchor: true,
  mechanics: {
    axisMode: 'split',
    payOnCompleteOnly: false,
    requireAdjacency: true,
    lockAndCash: false,
  },
  structure: 'grid',
  hexRadius: 4,
  hexWindow: 5,
  hexRingBonus: 0.1,

  rankChips: {
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 10, // J
    12: 10, // Q
    13: 10, // K
    14: 11, // A
  },

  hands: {
    'High Card': { minCards: 1, chips: 5, mult: 1 },
    Pair: { minCards: 2, chips: 10, mult: 2 },
    'Two Pair': { minCards: 4, chips: 20, mult: 2 },
    'Three of a Kind': { minCards: 3, chips: 30, mult: 3 },
    Straight: { minCards: 5, chips: 30, mult: 4 },
    Flush: { minCards: 5, chips: 35, mult: 4 },
    'Full House': { minCards: 5, chips: 40, mult: 4 },
    'Four of a Kind': { minCards: 4, chips: 60, mult: 7 },
    'Straight Flush': { minCards: 5, chips: 100, mult: 8 },
  },

  partialHands: {
    enabled: false,
    minCards: 3,
    scaleByLength: { 3: 0.5, 4: 0.75 },
  },

  cribbage: {
    chipsPerPoint: 6,
    baseChipsPerCard: 3,
    multPerPoint: 2,
    flushMin: 4,
  },
};

/** The starting anchor cell, dead centre of the board. */
export function anchorCell(cfg: Config = CONFIG): { r: number; c: number } {
  const mid = Math.floor(cfg.gridSize / 2);
  return { r: mid, c: mid };
}
