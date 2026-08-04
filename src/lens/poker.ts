import { rankChips } from '../deck';
import { evaluateHand } from '../hands';
import type { Lens, LineEval } from './types';

/**
 * The original rules, expressed as a lens. A line's points are the hand's
 * chip value plus every rank value in the line; a lone card gets its rank
 * value with no hand bonus. The hand's mult no longer applies to anything —
 * multipliers are a board feature now, not a lens output.
 */
export const pokerLens: Lens = {
  id: 'poker',
  name: 'Poker',
  blurb: 'Best five-card hand per line, scored by its chip value plus every rank in it.',

  evaluate(cards, cfg): LineEval {
    if (cards.length === 0) {
      return { name: '—', items: [], value: 0 };
    }

    const hand = evaluateHand(cards, cfg);
    const lone = cards.length === 1;
    const name = lone ? 'High Card' : hand.handName + (hand.partial ? ' (partial)' : '');

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
            label: `${name} — ${h.chips} points`,
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
            label: 'Points = the hand’s points + every rank in the line',
            detail:
              'Number cards are worth their face value, jacks through kings 10, aces 11. A lone card scores its rank and no hand bonus. Every line you join adds its points straight to the score — there is no second resource to multiply it by.',
          },
        ],
      },
    ];
  },
};
