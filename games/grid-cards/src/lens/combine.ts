import type { Config } from '../config';
import type { Card } from '../deck';
import type { Lens, LineEval, RuleSection } from './types';

/**
 * A counter *set* rather than a single lens: a line's points are the sum of
 * what every active lens says it is worth. With exactly one lens this is that
 * lens, unchanged, so the rest of the engine never has to know whether it is
 * scoring under one counter or several.
 */
export function combineLenses(lenses: readonly Lens[]): Lens {
  if (lenses.length === 0) throw new Error('combineLenses: needs at least one lens');
  if (lenses.length === 1) return lenses[0];

  return {
    id: lenses.map((l) => l.id).join('+'),
    name: lenses.map((l) => l.name).join(' + '),
    blurb: `Every line scores under ${lenses.map((l) => l.name).join(' and ')} at once, summed.`,

    evaluate(cards: readonly Card[], cfg: Config): LineEval {
      const evals = lenses.map((l) => l.evaluate(cards, cfg));
      return {
        name: evals.map((e) => e.name).join(' + '),
        // Labelled by lens, so the preview can still tell a fifteen from a
        // flush even though the score itself is one combined number.
        items: evals.flatMap((e, i) =>
          e.items.map((it) => ({ ...it, label: `${lenses[i].name}: ${it.label}` })),
        ),
        value: evals.reduce((sum, e) => sum + e.value, 0),
      };
    },

    rules(cfg: Config): RuleSection[] {
      return lenses.flatMap((l) =>
        l.rules(cfg).map((s) => ({ ...s, title: `${l.name} — ${s.title}` })),
      );
    },
  };
}
