import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { RANK_LABEL, type Card, type Rank, type Suit } from '../deck';
import {
  countFifteens,
  countPairs,
  cribbageCount,
  cribbageLens,
  cribOrder,
  cribValue,
  findRuns,
} from '../lens/cribbage';

const rankOf: Record<string, Rank> = {
  A: 14,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
};

/** "5H 5S 5D JH" — T is ten, so every token is two characters. */
function hand(spec: string): Card[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((tok, i) => {
      const rank = rankOf[tok[0].toUpperCase()];
      const suit = tok[1].toUpperCase() as Suit;
      if (!rank) throw new Error(`bad rank in "${tok}"`);
      return { id: `${RANK_LABEL[rank]}${suit}#${i}`, rank, suit };
    });
}

const total = (spec: string, cfg: Config = CONFIG) => cribbageCount(hand(spec), cfg).total;
const labels = (spec: string, cfg: Config = CONFIG) =>
  cribbageCount(hand(spec), cfg).items.map((i) => `${i.label}=${i.points}`);

describe('card values — the classic cribbage gotcha', () => {
  it('counts face cards as 10 towards fifteens', () => {
    expect(cribValue(11)).toBe(10);
    expect(cribValue(12)).toBe(10);
    expect(cribValue(13)).toBe(10);
  });

  it('counts the ace as 1, not 11', () => {
    expect(cribValue(14)).toBe(1);
  });

  it('but orders face cards at 11/12/13 for runs', () => {
    expect(cribOrder(11)).toBe(11);
    expect(cribOrder(12)).toBe(12);
    expect(cribOrder(13)).toBe(13);
    expect(cribOrder(14)).toBe(1);
  });
});

describe('countFifteens', () => {
  it('finds a two-card fifteen', () => {
    expect(countFifteens(hand('7H 8S'))).toBe(1);
  });

  it('finds a face-card fifteen', () => {
    expect(countFifteens(hand('KH 5S'))).toBe(1);
  });

  it('finds a three-card fifteen', () => {
    expect(countFifteens(hand('2H 6S 7D'))).toBe(1);
  });

  it('counts each distinct subset separately', () => {
    // 5H+TS, 5S+TS -> 2
    expect(countFifteens(hand('5H 5S TS'))).toBe(2);
  });

  it('handles the classic 5-5-5-J: four fifteens', () => {
    // Each 5 pairs with the J, plus the three 5s together.
    expect(countFifteens(hand('5H 5S 5D JC'))).toBe(4);
  });

  it('never counts a single card as a fifteen', () => {
    // A lone 5 is not 15; a lone face card is 10.
    expect(countFifteens(hand('5H'))).toBe(0);
    expect(countFifteens(hand('KH'))).toBe(0);
  });

  it('returns zero when nothing reaches fifteen', () => {
    expect(countFifteens(hand('2H 3S 4D'))).toBe(0);
  });

  it('does not double-count the same subset', () => {
    expect(countFifteens(hand('AH 2S 3D 4C 5H'))).toBe(1); // 1+2+3+4+5
  });
});

describe('countPairs', () => {
  it('counts a single pair', () => {
    expect(countPairs(hand('9H 9S'))).toBe(1);
  });

  it('counts three of a kind as three pairs', () => {
    expect(countPairs(hand('9H 9S 9D'))).toBe(3);
  });

  it('counts four of a kind as six pairs', () => {
    expect(countPairs(hand('9H 9S 9D 9C'))).toBe(6);
  });

  it('does not pair across different ranks', () => {
    expect(countPairs(hand('9H TS JD'))).toBe(0);
  });
});

describe('findRuns', () => {
  it('finds a run of three', () => {
    expect(findRuns(hand('3H 4S 5D'))).toEqual([{ length: 3, copies: 1 }]);
  });

  it('scores 3-4-5-6 as one run of four, not two runs of three', () => {
    expect(findRuns(hand('3H 4S 5D 6C'))).toEqual([{ length: 4, copies: 1 }]);
  });

  it('doubles a run when a rank is duplicated', () => {
    expect(findRuns(hand('4H 5S 5D 6C'))).toEqual([{ length: 3, copies: 2 }]);
  });

  it('quadruples a double-double run', () => {
    expect(findRuns(hand('4H 4S 5D 5C 6H'))).toEqual([{ length: 3, copies: 4 }]);
  });

  it('ignores sequences shorter than three', () => {
    expect(findRuns(hand('3H 4S'))).toEqual([]);
  });

  it('finds two disjoint runs in a longer line', () => {
    expect(findRuns(hand('2H 3S 4D 7C 8H 9S'))).toEqual([
      { length: 3, copies: 1 },
      { length: 3, copies: 1 },
    ]);
  });

  it('runs through face cards in order', () => {
    expect(findRuns(hand('TH JS QD'))).toEqual([{ length: 3, copies: 1 }]);
    expect(findRuns(hand('JH QS KD'))).toEqual([{ length: 3, copies: 1 }]);
  });

  it('treats the ace as low only — K-A-2 is not a run', () => {
    expect(findRuns(hand('KH AS 2D'))).toEqual([]);
    expect(findRuns(hand('AH 2S 3D'))).toEqual([{ length: 3, copies: 1 }]);
  });

  it('does not wrap from king back to ace', () => {
    expect(findRuns(hand('QH KS AD'))).toEqual([]);
  });
});

describe('cribbageCount — known hands', () => {
  it('scores the perfect 29 hand minus his nobs', () => {
    // 5-5-5-J with a 5 cut: eight fifteens (16) + four of a kind (12) = 28.
    // The 29th point is his nobs, which needs a starter suit we do not model.
    expect(total('5H 5S 5D 5C JH')).toBe(28);
  });

  it('scores a double run of three with a fifteen', () => {
    // 4-5-5-6: two runs of three (6) + pair (2) + 4+5+6 fifteens (x2 = 4) = 12
    expect(total('4H 5S 5D 6C')).toBe(12);
  });

  it('scores a plain run of five', () => {
    // A-2-3-4-5: run of 5 (5) + one fifteen (2) = 7
    expect(total('AH 2S 3D 4C 5H')).toBe(7);
  });

  it('scores a five-card flush', () => {
    // 2-4-6-8-T all hearts: flush 5, fifteens 2+4+9? -> check items instead
    const r = cribbageCount(hand('2H 4H 6H 8H TH'), CONFIG);
    expect(r.items.find((i) => i.label.startsWith('Flush'))?.points).toBe(5);
  });

  it('does not give a flush below the configured minimum', () => {
    expect(labels('2H 4H 6H')).not.toContain('Flush (3)=3');
  });

  it('gives a three-card flush when the minimum is lowered', () => {
    const cfg: Config = { ...CONFIG, cribbage: { ...CONFIG.cribbage, flushMin: 3 } };
    expect(labels('2H 4H 6H', cfg)).toContain('Flush (3)=3');
  });

  it('scores nothing for a single card', () => {
    expect(total('7H')).toBe(0);
  });

  it('scores a bare two-card fifteen — the point of using cribbage', () => {
    expect(total('7H 8S')).toBe(2);
    expect(total('KH 5S')).toBe(2);
  });

  it('scores a bare pair', () => {
    expect(total('9H 9S')).toBe(2);
  });

  it('scores zero for a dead two-card line', () => {
    expect(total('2H 9S')).toBe(0);
  });
});

describe('cribbageLens', () => {
  it('converts the count into chips, plus a flat base per card', () => {
    const { chipsPerPoint, baseChipsPerCard } = CONFIG.cribbage;
    const r = cribbageLens.evaluate(hand('7H 8S'), 'chips', CONFIG);
    expect(r.value).toBe(2 * chipsPerPoint + 2 * baseChipsPerCard);
    expect(r.name).toBe('2 pts');
    expect(r.items).toContainEqual({ label: 'Cards (2)', points: 2 * baseChipsPerCard });
  });

  it('still pays the base when a line has no count — no wasted placements', () => {
    const r = cribbageLens.evaluate(hand('2H 9S'), 'chips', CONFIG);
    expect(r.name).toBe('No count');
    expect(r.value).toBe(2 * CONFIG.cribbage.baseChipsPerCard);
  });

  it('drops to a pure count when the base is switched off', () => {
    const cfg: Config = { ...CONFIG, cribbage: { ...CONFIG.cribbage, baseChipsPerCard: 0 } };
    expect(cribbageLens.evaluate(hand('2H 9S'), 'chips', cfg).value).toBe(0);
    expect(cribbageLens.evaluate(hand('7H 8S'), 'chips', cfg).value).toBe(
      2 * CONFIG.cribbage.chipsPerPoint,
    );
  });

  it('never lets the base leak into mult — mult is the count alone', () => {
    expect(cribbageLens.evaluate(hand('2H 9S'), 'mult', CONFIG).value).toBe(1);
    expect(cribbageLens.evaluate(hand('2H 9S'), 'mult', CONFIG).items).toEqual([]);
  });

  it('grows mult smoothly with the count instead of stepping at 1', () => {
    const mult = (spec: string) => cribbageLens.evaluate(hand(spec), 'mult', CONFIG).value;
    expect(mult('2H 9S')).toBe(1); // no count
    expect(mult('7H 8S')).toBe(2); // 2 pts
    expect(mult('4H 5S 5D 6C')).toBe(7); // 12 pts
  });

  it('reports a lone card as no count, worth only its base chips and ×1', () => {
    expect(cribbageLens.evaluate(hand('7H'), 'chips', CONFIG)).toMatchObject({
      name: 'No count',
      value: CONFIG.cribbage.baseChipsPerCard,
    });
    expect(cribbageLens.evaluate(hand('7H'), 'mult', CONFIG).value).toBe(1);
  });

  it('follows a retuned conversion rate', () => {
    const cfg: Config = {
      ...CONFIG,
      cribbage: { ...CONFIG.cribbage, chipsPerPoint: 10, multPerPoint: 4 },
    };
    expect(cribbageLens.evaluate(hand('4H 5S 5D 6C'), 'chips', cfg).value).toBe(
      12 * 10 + 4 * CONFIG.cribbage.baseChipsPerCard,
    );
    expect(cribbageLens.evaluate(hand('4H 5S 5D 6C'), 'mult', cfg).value).toBe(4);
  });
});
