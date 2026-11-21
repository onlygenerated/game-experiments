import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { evaluateHand, isRunOfRanks } from '../hands';
import { RANK_LABEL, type Card, type Rank, type Suit } from '../deck';

/** "AS 2H TD" -> cards. T is ten, so every token is two characters. */
function hand(spec: string): Card[] {
  const rankOf: Record<string, Rank> = {
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
    A: 14,
  };
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

const withPartials = (over: Partial<Config['partialHands']> = {}): Config => ({
  ...CONFIG,
  partialHands: { ...CONFIG.partialHands, enabled: true, ...over },
});

describe('isRunOfRanks', () => {
  it('accepts an ace-high run', () => {
    expect(isRunOfRanks(hand('TS JH QD KC AS'))).toBe(true);
  });

  it('accepts an ace-low run', () => {
    expect(isRunOfRanks(hand('AS 2H 3D 4C 5S'))).toBe(true);
  });

  it('rejects a wrapping run (K A 2 3 4)', () => {
    expect(isRunOfRanks(hand('KS AH 2D 3C 4S'))).toBe(false);
  });

  it('rejects a run with a duplicated rank', () => {
    expect(isRunOfRanks(hand('5S 5H 6D 7C 8S'))).toBe(false);
  });

  it('rejects a gap', () => {
    expect(isRunOfRanks(hand('2S 3H 4D 5C 7S'))).toBe(false);
  });

  it('does not care about card order', () => {
    expect(isRunOfRanks(hand('7S 5H 8D 4C 6S'))).toBe(true);
  });
});

describe('evaluateHand — classification', () => {
  const cases: Array<[string, string]> = [
    ['9H', 'High Card'],
    ['9H 4S', 'High Card'],
    ['9H 9S', 'Pair'],
    ['9H 9S 4D 4C', 'Two Pair'],
    ['9H 9S 4D 4C 2S', 'Two Pair'],
    ['9H 9S 9D', 'Three of a Kind'],
    ['9H 9S 9D 4C', 'Three of a Kind'],
    ['9H 9S 9D 4C 4S', 'Full House'],
    ['9H 9S 9D 9C', 'Four of a Kind'],
    ['9H 9S 9D 9C 4S', 'Four of a Kind'],
    ['2S 3H 4D 5C 6S', 'Straight'],
    ['AS 2H 3D 4C 5S', 'Straight'],
    ['TS JH QD KC AS', 'Straight'],
    ['2H 7H 9H JH KH', 'Flush'],
    ['2H 3H 4H 5H 6H', 'Straight Flush'],
    ['TH JH QH KH AH', 'Straight Flush'],
  ];

  for (const [spec, expected] of cases) {
    it(`${spec} -> ${expected}`, () => {
      expect(evaluateHand(hand(spec)).handName).toBe(expected);
    });
  }

  it('returns a neutral result for an empty line', () => {
    expect(evaluateHand([])).toMatchObject({ handName: 'High Card', chips: 0, mult: 1 });
  });
});

describe('evaluateHand — chips and mult come from the config table', () => {
  it('reads Pair straight off the table', () => {
    expect(evaluateHand(hand('9H 9S'))).toMatchObject({ chips: 10, mult: 2, partial: false });
  });

  it('reads Straight Flush straight off the table', () => {
    expect(evaluateHand(hand('2H 3H 4H 5H 6H'))).toMatchObject({ chips: 100, mult: 8 });
  });

  it('follows a retuned table', () => {
    const cfg: Config = { ...CONFIG, hands: { ...CONFIG.hands, Pair: { minCards: 2, chips: 99, mult: 6 } } };
    expect(evaluateHand(hand('9H 9S'), cfg)).toMatchObject({ chips: 99, mult: 6 });
  });
});

describe('evaluateHand — partial straights and flushes', () => {
  it('does not see a 3- or 4-card flush by default', () => {
    expect(evaluateHand(hand('2H 7H JH')).handName).toBe('High Card');
    expect(evaluateHand(hand('2H 7H JH KH')).handName).toBe('High Card');
  });

  it('does not see a 3- or 4-card straight by default', () => {
    expect(evaluateHand(hand('2H 3S 4D')).handName).toBe('High Card');
    expect(evaluateHand(hand('2H 3S 4D 5C')).handName).toBe('High Card');
  });

  it('sees them once the toggle is on, at reduced value', () => {
    const cfg = withPartials();
    // Flush base 35/4 at 0.5 -> 18/2 (chips rounded, mult floored at 1).
    expect(evaluateHand(hand('2H 7H JH'), cfg)).toMatchObject({
      handName: 'Flush',
      chips: 18,
      mult: 2,
      partial: true,
      scale: 0.5,
    });
    // Straight base 30/4 at 0.75 -> 23/3.
    expect(evaluateHand(hand('2H 3S 4D 5C'), cfg)).toMatchObject({
      handName: 'Straight',
      chips: 23,
      mult: 3,
      partial: true,
      scale: 0.75,
    });
  });

  it('scores a 4-card straight flush as a partial straight flush', () => {
    expect(evaluateHand(hand('2H 3H 4H 5H'), withPartials())).toMatchObject({
      handName: 'Straight Flush',
      partial: true,
    });
  });

  it('leaves full-length hands unscaled when the toggle is on', () => {
    expect(evaluateHand(hand('2H 3H 4H 5H 6H'), withPartials())).toMatchObject({
      chips: 100,
      mult: 8,
      partial: false,
      scale: 1,
    });
  });

  it('never scales hands the toggle does not relax', () => {
    // A 3-card trips is a real Three of a Kind, not a partial.
    expect(evaluateHand(hand('9H 9S 9D'), withPartials())).toMatchObject({
      handName: 'Three of a Kind',
      chips: 30,
      mult: 3,
      partial: false,
    });
  });

  it('respects a raised partial minimum', () => {
    const cfg = withPartials({ minCards: 4 });
    expect(evaluateHand(hand('2H 7H JH'), cfg).handName).toBe('High Card');
    expect(evaluateHand(hand('2H 7H JH KH'), cfg).handName).toBe('Flush');
  });
});

describe('evaluateHand — hand ordering', () => {
  it('prefers the full house over the flush-shaped read', () => {
    expect(evaluateHand(hand('9H 9S 9D 4C 4S')).handName).toBe('Full House');
  });

  it('prefers four of a kind over two pair', () => {
    expect(evaluateHand(hand('9H 9S 9D 9C 4S')).handName).toBe('Four of a Kind');
  });

  it('prefers straight flush over both its parts', () => {
    const r = evaluateHand(hand('5H 6H 7H 8H 9H'));
    expect(r.handName).toBe('Straight Flush');
    expect(r.mult).toBe(8);
  });

  it('does not read a 5-card line containing a 4-card straight as a straight', () => {
    expect(evaluateHand(hand('2S 3H 4D 5C KS')).handName).toBe('High Card');
  });
});
