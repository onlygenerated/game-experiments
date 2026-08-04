import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { RANK_LABEL, type Card, type Rank, type Suit } from '../deck';
import { activeLensIds, combineLenses, cribbageLens, getScoringLens, pokerLens } from '../lens';

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

/** "5H JS TD" — T is ten, so every token is two characters. */
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

describe('activeLensIds', () => {
  it('is just the primary lens with no second counter', () => {
    expect(activeLensIds({ ...CONFIG, lensId: 'poker', secondLensId: '' })).toEqual(['poker']);
  });

  it('includes the second counter when one is set', () => {
    expect(activeLensIds({ ...CONFIG, lensId: 'cribbage', secondLensId: 'poker' })).toEqual([
      'cribbage',
      'poker',
    ]);
  });
});

describe('combineLenses', () => {
  it('returns the lens unchanged when there is only one', () => {
    expect(combineLenses([pokerLens])).toBe(pokerLens);
  });

  it('sums the value of every active lens for the same line', () => {
    const cards = hand('5H JS TD'); // a fifteen under cribbage (5+J), and real poker rank chips
    const combo = combineLenses([cribbageLens, pokerLens]);
    const cribEval = cribbageLens.evaluate(cards, CONFIG);
    const pokerEval = pokerLens.evaluate(cards, CONFIG);
    const comboEval = combo.evaluate(cards, CONFIG);

    // The whole point of the item: a line scoring under both gets both, not
    // whichever is larger and not an average.
    expect(comboEval.value).toBe(cribEval.value + pokerEval.value);
    expect(cribEval.value).toBeGreaterThan(0);
    expect(pokerEval.value).toBeGreaterThan(0);
  });

  it('labels each itemised line by which counter produced it', () => {
    const cards = hand('5H JS TD');
    const combo = combineLenses([cribbageLens, pokerLens]);
    const items = combo.evaluate(cards, CONFIG).items;
    expect(items.some((i) => i.label.startsWith('Cribbage: '))).toBe(true);
    expect(items.some((i) => i.label.startsWith('Poker: '))).toBe(true);
  });

  it('concatenates rules from every active lens, each still legible as its own', () => {
    const combo = combineLenses([cribbageLens, pokerLens]);
    const sections = combo.rules(CONFIG);
    expect(sections.some((s) => s.title.startsWith('Cribbage — '))).toBe(true);
    expect(sections.some((s) => s.title.startsWith('Poker — '))).toBe(true);
  });
});

describe('getScoringLens', () => {
  it('is the plain lens when there is no second counter', () => {
    const cfg = { ...CONFIG, lensId: 'poker', secondLensId: '' };
    expect(getScoringLens(cfg)).toBe(pokerLens);
  });

  it('combines lensId and secondLensId when both are set', () => {
    const cfg = { ...CONFIG, lensId: 'cribbage', secondLensId: 'poker' };
    const cards = hand('5H JS TD');
    const combined = getScoringLens(cfg).evaluate(cards, cfg);
    const separately =
      cribbageLens.evaluate(cards, cfg).value + pokerLens.evaluate(cards, cfg).value;
    expect(combined.value).toBe(separately);
  });
});
