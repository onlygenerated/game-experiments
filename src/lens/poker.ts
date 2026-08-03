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

  rules(cfg) {
    // A hand needing more cards than a line can hold is unreachable, and
    // saying so is more useful than listing it: at cap 4 there are no
    // straights, flushes, full houses or straight flushes in this game at all.
    const reachable = Object.entries(cfg.hands).filter(
      ([, h]) => h.minCards <= cfg.lineCap,
    );
    const unreachable = Object.entries(cfg.hands)
      .filter(([, h]) => h.minCards > cfg.lineCap)
      .map(([name]) => name);

    const p = cfg.partialHands;
    const scales = Object.entries(p.scaleByLength)
      .map(([len, mul]) => `${len} cards at ${Math.round(mul * 100)}%`)
      .join(', ');

    return [
      {
        title: 'Counting a line',
        lines: [
          {
            label: 'The single best hand in the line',
            detail:
              'Only one hand counts — the best one. Cards that are not part of it still contribute their rank value, but they add nothing on their own.',
          },
          ...reachable.map(([name, h]) => ({
            label: `${name} — ${h.chips} chips, ×${h.mult}`,
            detail: `Needs ${h.minCards} card${h.minCards === 1 ? '' : 's'}.`,
          })),
          ...(unreachable.length
            ? [
                {
                  label: 'Out of reach at this line length',
                  detail: `${unreachable.join(', ')} need more cards than the ${cfg.lineCap}-card cap allows, so they cannot occur in this ruleset.`,
                },
              ]
            : []),
          {
            label: p.enabled ? `Partial hands count — ${scales}` : 'Partial hands do not count',
            detail: p.enabled
              ? `A line that is entirely a short straight or flush scores at a reduced rate from ${p.minCards} cards.`
              : 'A four-card straight is worth nothing as a straight. It is all or nothing.',
          },
        ],
      },
      {
        title: 'Turning the hand into a score',
        lines: [
          {
            label: 'Chips = the hand’s chips + every rank in the line',
            detail:
              'Number cards are worth their face value, jacks through kings 10, aces 11. A lone card scores its rank and no hand bonus.',
          },
          {
            label: 'Mult = the hand’s multiplier',
            detail:
              'A line with no hand in it sits at ×1, which is why the mult axis can feel dead under these rules.',
          },
        ],
      },
    ];
  },
};
