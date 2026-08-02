import { rankChips } from '../deck';
import { evaluateHand } from '../hands';
import type { AxisRole, Lens, LineEval } from './types';

/**
 * The original rules, expressed as a lens. Behaviour is unchanged: chips are
 * the hand's base plus every rank value in the line, mult is the hand's mult,
 * and a line of one card gets its rank value with no hand bonus.
 */
export const pokerLens: Lens = {
  id: 'poker',
  name: 'Poker',
  blurb: 'Best five-card hand per line. Chips from the row, mult from the column.',

  evaluate(cards, role: AxisRole, cfg): LineEval {
    if (cards.length === 0) {
      return { name: '—', items: [], value: role === 'mult' ? 1 : 0 };
    }

    const hand = evaluateHand(cards, cfg);
    const lone = cards.length === 1;
    const name = lone ? 'High Card' : hand.handName + (hand.partial ? ' (partial)' : '');

    if (role === 'mult') {
      // A line of one has no vertical structure, so it cannot multiply.
      const value = lone ? 1 : hand.mult;
      return { name, items: [{ label: name, points: value }], value };
    }

    const rankTotal = cards.reduce((sum, c) => sum + rankChips(c.rank, cfg), 0);
    const handChips = lone ? 0 : hand.chips;
    return {
      name,
      items: [
        ...(lone ? [] : [{ label: name, points: handChips }]),
        { label: `Ranks (${cards.length})`, points: rankTotal },
      ],
      value: handChips + rankTotal,
    };
  },
};
