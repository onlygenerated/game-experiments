import { CONFIG, type Config, type HandName } from './config';
import type { Card, Rank } from './deck';

export interface HandResult {
  handName: HandName;
  chips: number;
  mult: number;
  /**
   * True when the hand only registered because partial straights/flushes are
   * enabled, i.e. the line is shorter than the hand's normal minimum. Its chips
   * and mult have been scaled down by `scale`.
   */
  partial: boolean;
  scale: number;
}

/** Strongest first. Detection walks this list and takes the first match. */
const HAND_ORDER: HandName[] = [
  'Straight Flush',
  'Four of a Kind',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'Pair',
  'High Card',
];

/** Hands whose card-count requirement the partial toggle is allowed to relax. */
const RELAXABLE: ReadonlySet<HandName> = new Set<HandName>([
  'Straight',
  'Flush',
  'Straight Flush',
]);

function rankCounts(cards: readonly Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return counts;
}

function allSameSuit(cards: readonly Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit);
}

/**
 * True when every rank in the line is distinct and they form one unbroken run.
 * Aces play high (10-J-Q-K-A) or low (A-2-3-4-5).
 */
export function isRunOfRanks(cards: readonly Card[]): boolean {
  const ranks = cards.map((c) => c.rank);
  if (new Set(ranks).size !== ranks.length) return false;
  if (ranks.length < 2) return true;

  const consecutive = (xs: number[]) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s.every((v, i) => i === 0 || v === s[i - 1] + 1);
  };

  if (consecutive(ranks)) return true;
  // Ace-low: retry with A as 1. Only meaningful if an ace is present.
  if (ranks.includes(14)) return consecutive(ranks.map((r) => (r === 14 ? 1 : r)));
  return false;
}

/**
 * Effective minimum card count for a hand, after the partial-hands toggle.
 * This is the single knob that turns 3/4-card straights and flushes on.
 */
function effectiveMinCards(hand: HandName, cfg: Config): number {
  const base = cfg.hands[hand].minCards;
  if (!cfg.partialHands.enabled || !RELAXABLE.has(hand)) return base;
  return Math.min(base, cfg.partialHands.minCards);
}

function matches(hand: HandName, cards: readonly Card[], cfg: Config): boolean {
  const n = cards.length;
  if (n < effectiveMinCards(hand, cfg)) return false;

  const counts = [...rankCounts(cards).values()].sort((a, b) => b - a);
  const max = counts[0] ?? 0;
  const pairs = counts.filter((c) => c >= 2).length;
  const flush = allSameSuit(cards);
  const straight = isRunOfRanks(cards);

  switch (hand) {
    case 'Straight Flush':
      return flush && straight;
    case 'Four of a Kind':
      return max >= 4;
    case 'Full House':
      return max === 3 && counts[1] >= 2;
    case 'Flush':
      return flush;
    case 'Straight':
      return straight;
    case 'Three of a Kind':
      return max === 3;
    case 'Two Pair':
      return pairs >= 2;
    case 'Pair':
      return max === 2;
    case 'High Card':
      return true;
  }
}

/**
 * Evaluate a line of cards as the best poker hand it qualifies for.
 *
 * The input is a whole line (1..lineCap cards), not a 5-card selection: a
 * 5-card line containing a 4-card straight is *not* a straight, exactly as in
 * poker. Partial hands, when enabled, apply to lines that are entirely a 3- or
 * 4-card straight/flush.
 */
export function evaluateHand(cards: readonly Card[], cfg: Config = CONFIG): HandResult {
  if (cards.length === 0) {
    return { handName: 'High Card', chips: 0, mult: 1, partial: false, scale: 1 };
  }

  const handName = HAND_ORDER.find((h) => matches(h, cards, cfg)) ?? 'High Card';
  const entry = cfg.hands[handName];

  const partial = cards.length < entry.minCards;
  const scale = partial ? (cfg.partialHands.scaleByLength[cards.length] ?? 1) : 1;

  return {
    handName,
    chips: Math.round(entry.chips * scale),
    mult: Math.max(1, Math.round(entry.mult * scale)),
    partial,
    scale,
  };
}
