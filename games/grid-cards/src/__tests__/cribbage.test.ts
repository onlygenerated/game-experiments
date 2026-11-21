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
import { getLens } from '../lens';
import { pokerLens } from '../lens/poker';
import { RULESETS } from '../rulesets';

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
  it('converts the count into points, plus a flat base per card', () => {
    const { chipsPerPoint, baseChipsPerCard } = CONFIG.cribbage;
    const r = cribbageLens.evaluate(hand('7H 8S'), CONFIG);
    expect(r.value).toBe(2 * chipsPerPoint + 2 * baseChipsPerCard);
    expect(r.name).toBe('2 pts');
    expect(r.items).toContainEqual({ label: 'Cards (2)', points: 2 * baseChipsPerCard });
  });

  it('still pays the base when a line has no count — no wasted placements', () => {
    const r = cribbageLens.evaluate(hand('2H 9S'), CONFIG);
    expect(r.name).toBe('No count');
    expect(r.value).toBe(2 * CONFIG.cribbage.baseChipsPerCard);
  });

  it('drops to a pure count when the base is switched off', () => {
    const cfg: Config = { ...CONFIG, cribbage: { ...CONFIG.cribbage, baseChipsPerCard: 0 } };
    expect(cribbageLens.evaluate(hand('2H 9S'), cfg).value).toBe(0);
    expect(cribbageLens.evaluate(hand('7H 8S'), cfg).value).toBe(2 * CONFIG.cribbage.chipsPerPoint);
  });

  it('reports a lone card as no count, worth only its base points', () => {
    expect(cribbageLens.evaluate(hand('7H'), CONFIG)).toMatchObject({
      name: 'No count',
      value: CONFIG.cribbage.baseChipsPerCard,
    });
  });

  it('follows a retuned conversion rate', () => {
    const cfg: Config = {
      ...CONFIG,
      cribbage: { ...CONFIG.cribbage, chipsPerPoint: 10 },
    };
    expect(cribbageLens.evaluate(hand('4H 5S 5D 6C'), cfg).value).toBe(
      12 * 10 + 4 * CONFIG.cribbage.baseChipsPerCard,
    );
  });
});

// --- the rules panel --------------------------------------------------------
//
// The examples printed in the app are checked against the scorer here, because
// a rules screen that quietly disagrees with the game is worse than no rules
// screen: the player trusts it and cannot tell it is wrong.

describe('lens.rules', () => {
  it('states the fifteens example correctly', () => {
    const { items } = cribbageCount(hand('5H JS TD'), CONFIG);
    expect(items).toContainEqual({ label: 'Fifteen ×2', points: 4 });
  });

  it('states the pairs example correctly', () => {
    const { items } = cribbageCount(hand('7H 7S 7C'), CONFIG);
    expect(items).toContainEqual({ label: 'Pair ×3', points: 6 });
  });

  it('states the runs example correctly', () => {
    const { items } = cribbageCount(hand('4D 5H 5S 6C'), CONFIG);
    expect(items).toContainEqual({ label: 'Run of 3 ×2', points: 6 });
  });

  it('quotes each ruleset‘s own numbers rather than the defaults', () => {
    const flush3: Config = { ...CONFIG, cribbage: { ...CONFIG.cribbage, flushMin: 3 } };
    const labels = (cfg: Config) =>
      cribbageLens.rules(cfg).flatMap((s) => s.lines.map((l) => l.label));

    expect(labels(CONFIG).some((l) => l.includes('from 4'))).toBe(true);
    expect(labels(flush3).some((l) => l.includes('from 3'))).toBe(true);

    const pure: Config = { ...CONFIG, cribbage: { ...CONFIG.cribbage, baseChipsPerCard: 0 } };
    const chipsLine = (cfg: Config) => labels(cfg).find((l) => l.startsWith('Points ='))!;
    expect(chipsLine(CONFIG)).toContain('per card');
    expect(chipsLine(pure)).not.toContain('per card');
  });

  it('tells the player which poker hands the line cap puts out of reach', () => {
    const details = (cfg: Config) =>
      pokerLens.rules(cfg).flatMap((s) => s.lines.map((l) => `${l.label} ${l.detail}`)).join('\n');

    // At the default cap of 5 every hand can occur.
    expect(details(CONFIG)).not.toContain('Out of reach');
    // At 4 the five-card hands cannot, and the panel has to say so rather than
    // listing them as if they were achievable.
    const short = details({ ...CONFIG, lineCap: 4 });
    expect(short).toContain('Out of reach');
    for (const hand of ['Straight', 'Flush', 'Full House', 'Straight Flush']) {
      expect(short).toContain(hand);
    }
  });

  it('produces usable rules for every shipped ruleset', () => {
    for (const rs of RULESETS) {
      const sections = getLens(rs.config.lensId).rules(rs.config);
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        expect(s.title).not.toHaveLength(0);
        expect(s.lines.length).toBeGreaterThan(0);
        for (const l of s.lines) {
          expect(l.label).not.toHaveLength(0);
          expect(l.detail).not.toHaveLength(0);
        }
      }
    }
  });
});
