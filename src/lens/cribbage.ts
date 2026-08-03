import type { Config } from '../config';
import type { Card, Rank } from '../deck';
import type { AxisRole, Lens, LineEval, ScoreItem } from './types';

/**
 * Cribbage counts a card two different ways, and mixing them up is the classic
 * bug: face cards are worth 10 towards fifteens but sit at 11/12/13 in a run.
 * The ace is low only — K-A-2 is not a run.
 */
export function cribValue(rank: Rank): number {
  if (rank === 14) return 1; // ace
  return rank >= 11 ? 10 : rank; // J/Q/K
}

export function cribOrder(rank: Rank): number {
  return rank === 14 ? 1 : rank;
}

/** Number of distinct subsets of size >= 2 whose values total exactly 15. */
export function countFifteens(cards: readonly Card[]): number {
  const values = cards.map((c) => cribValue(c.rank));
  let found = 0;

  const walk = (i: number, sum: number, picked: number) => {
    if (sum === 15 && picked >= 2) {
      found++;
      // A 15 can't be extended into another 15 — every value is positive.
      return;
    }
    if (sum >= 15 || i >= values.length) return;
    walk(i + 1, sum + values[i], picked + 1);
    walk(i + 1, sum, picked);
  };

  walk(0, 0, 0);
  return found;
}

/** Every unordered pair of matching ranks. Trips give 3, quads give 6. */
export function countPairs(cards: readonly Card[]): number {
  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  let pairs = 0;
  for (const n of counts.values()) pairs += (n * (n - 1)) / 2;
  return pairs;
}

export interface RunResult {
  /** Length of each maximal run of 3+, with duplicates already multiplied in. */
  length: number;
  /** How many distinct runs of that length the duplicates produce. */
  copies: number;
}

/**
 * Maximal consecutive groups only — 3-4-5-6 is one run of four, never two runs
 * of three. Duplicated ranks multiply the number of distinct runs, so 4-5-5-6
 * is two runs of three.
 */
export function findRuns(cards: readonly Card[]): RunResult[] {
  const counts = new Map<number, number>();
  for (const c of cards) {
    const o = cribOrder(c.rank);
    counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  const present = [...counts.keys()].sort((a, b) => a - b);

  const out: RunResult[] = [];
  let start = 0;
  for (let i = 0; i <= present.length; i++) {
    const broken = i === present.length || present[i] !== present[i - 1] + 1;
    if (i > start && broken) {
      const group = present.slice(start, i);
      if (group.length >= 3) {
        const copies = group.reduce((p, o) => p * (counts.get(o) ?? 1), 1);
        out.push({ length: group.length, copies });
      }
      start = i;
    } else if (broken) {
      start = i;
    }
  }
  return out;
}

/** Itemised cribbage count for a line of cards. */
export function cribbageCount(
  cards: readonly Card[],
  cfg: Config,
): { items: ScoreItem[]; total: number } {
  const items: ScoreItem[] = [];
  if (cards.length < 2) return { items, total: 0 };

  const fifteens = countFifteens(cards);
  if (fifteens) {
    items.push({ label: `Fifteen${fifteens > 1 ? ` ×${fifteens}` : ''}`, points: fifteens * 2 });
  }

  const pairs = countPairs(cards);
  if (pairs) {
    items.push({ label: `Pair${pairs > 1 ? ` ×${pairs}` : ''}`, points: pairs * 2 });
  }

  for (const run of findRuns(cards)) {
    items.push({
      label: `Run of ${run.length}${run.copies > 1 ? ` ×${run.copies}` : ''}`,
      points: run.length * run.copies,
    });
  }

  const flushMin = cfg.cribbage.flushMin;
  if (cards.length >= flushMin && cards.every((c) => c.suit === cards[0].suit)) {
    items.push({ label: `Flush (${cards.length})`, points: cards.length });
  }

  return { items, total: items.reduce((s, it) => s + it.points, 0) };
}

/**
 * Cribbage as a scoring lens.
 *
 * The appeal over poker here is that the count is *additive and combinatorial*
 * rather than a single best-hand category, so a line's value grows faster than
 * its length — and a two-card line already scores if it makes a fifteen or a
 * pair. That is the direct fix for poker's dead `High Card ×1` columns.
 */
export const cribbageLens: Lens = {
  id: 'cribbage',
  name: 'Cribbage',
  blurb: 'Fifteens, pairs, runs and flushes. Additive, so bigger structures pay off faster.',

  evaluate(cards, role: AxisRole, cfg): LineEval {
    const { items, total } = cribbageCount(cards, cfg);
    const name = total === 0 ? 'No count' : `${total} pt${total === 1 ? '' : 's'}`;

    if (role === 'chips') {
      // A flat base per card keeps every placement worth something, so the
      // count supplies the spikes rather than the entire score.
      const base = cards.length * cfg.cribbage.baseChipsPerCard;
      const items2 = base ? [...items, { label: `Cards (${cards.length})`, points: base }] : items;
      return { name, items: items2, value: total * cfg.cribbage.chipsPerPoint + base };
    }
    // Mult rises smoothly with the count instead of sitting at 1 until a hand
    // happens to form — the whole reason the poker column felt dead.
    return {
      name,
      items,
      value: 1 + Math.floor(total / cfg.cribbage.multPerPoint),
    };
  },

  rules(cfg) {
    const c = cfg.cribbage;
    return [
      {
        title: 'Counting a line',
        lines: [
          {
            label: 'Fifteens — 2 points each',
            detail:
              'Every distinct group of two or more cards in the line adding up to exactly 15. Aces count 1; jacks, queens and kings count 10. One line can contain several.',
            example: '5 ♥ · J ♠ · 10 ♦ → two fifteens (5+J, 5+10) = 4 points',
          },
          {
            label: 'Pairs — 2 points each',
            detail:
              'Every pair of matching ranks, counted separately. Three of a kind is three pairs, four of a kind is six.',
            example: '7 ♥ · 7 ♠ · 7 ♣ → three pairs = 6 points',
          },
          {
            label: 'Runs — 1 point per card',
            detail:
              'Three or more consecutive ranks, in any order. Only the longest run counts, so 3-4-5-6 is one run of four rather than two of three. A duplicated rank makes a second run. Ace is low only — K-A-2 is not a run.',
            example: '4 ♦ · 5 ♥ · 5 ♠ · 6 ♣ → two runs of three = 6 points',
          },
          {
            label: `Flush — 1 point per card, from ${c.flushMin}`,
            detail: `The whole line in one suit, at least ${c.flushMin} cards long.`,
          },
        ],
      },
      {
        title: 'Turning the count into a score',
        lines: [
          {
            label: `Chips = count × ${c.chipsPerPoint}${
              c.baseChipsPerCard ? ` + ${c.baseChipsPerCard} per card` : ''
            }`,
            detail: c.baseChipsPerCard
              ? 'The flat amount per card means a line with no count is still worth something, so no placement is completely wasted.'
              : 'No flat amount per card, so a line that counts nothing scores nothing — a placement really can be wasted.',
          },
          {
            label: `Mult = 1 + count ÷ ${c.multPerPoint}`,
            detail:
              'Rounded down. The count is additive, so mult climbs gradually instead of sitting at ×1 until a hand happens to form.',
          },
        ],
      },
    ];
  },
};
