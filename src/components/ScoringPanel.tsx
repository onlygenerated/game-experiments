import type { Config } from '../config';
import { getLens, type RuleSection } from '../lens';
import type { Ruleset } from '../rulesets';

/**
 * How the rules the player is actually playing under work.
 *
 * Every line is derived from the live `Config` rather than written out, so a
 * ruleset that retunes a number, swaps a lens or flips a mechanic explains
 * itself correctly without anyone editing prose. The lens supplies its own
 * scoring sections; the board and run sections are the same for all of them.
 */
function structureSections(cfg: Config): RuleSection[] {
  const m = cfg.mechanics;

  const axis: Record<Config['mechanics']['axisMode'], string> = {
    split: 'The row your card joins feeds chips. The column feeds mult. The two resources come from different directions, which is what makes where you play matter.',
    both: 'Every line you join feeds chips and mult at once, so both resources come from the same placement.',
    suit: 'A red card reads its row as chips and its column as mult. A black card reads them the other way round, so the card in your hand decides which line feeds which.',
  };

  const placement: RuleSection = {
    title: 'The board',
    lines: [
      cfg.structure === 'hex'
        ? {
            label: `Hex board, ${cfg.hexRadius} rings out`,
            detail: `Three line directions run through every hex. Lines have no length limit — only your best ${cfg.hexWindow} cards along each one score.`,
          }
        : {
            label: `${cfg.gridSize} × ${cfg.gridSize} grid, lines up to ${cfg.lineCap} cards`,
            detail: `A run of ${cfg.lineCap} is full and can never be extended. You cannot play a card that would push a row or column past it.`,
          },
      {
        label: m.requireAdjacency ? 'Cards must touch' : 'Play anywhere',
        detail: m.requireAdjacency
          ? 'Every placement has to sit next to a card already on the board, so the structure grows outward from where it started.'
          : 'No adjacency requirement. Any empty cell is legal, so placements need not connect to anything.',
      },
      {
        label: cfg.startWithAnchor ? 'One card starts in the centre' : 'The board starts empty',
        detail: cfg.startWithAnchor
          ? 'Play grows out from it.'
          : 'Your first placement picks where the whole structure grows from, which is a decision in itself.',
      },
      ...(cfg.structure === 'hex' && cfg.hexRingBonus > 0
        ? [
            {
              label: `Distance bonus — +${Math.round(cfg.hexRingBonus * 100)}% per ring`,
              detail: 'A placement further from the centre scores more, so building outward pays.',
            },
          ]
        : []),
    ],
  };

  const scoringWhen: RuleSection = {
    title: 'When you score',
    lines: [
      { label: 'Chips × mult', detail: axis[m.axisMode] },
      m.lockAndCash
        ? {
            label: 'Nothing banks until you cash it',
            detail: `Placing a card scores nothing on its own. Tap a card on the board to cash its cross — chips × mult — which seals both of its lines for good: they can never be extended or cashed again. Cashing costs one action from the same budget as a placement, so every bank is a card you did not play, and anything still uncashed when the actions run out is worth nothing.`,
          }
        : m.payOnCompleteOnly
          ? {
              label: 'A line pays only when it fills up',
              detail: `A placement that does not complete a row or column banks nothing at all, however good it looks. The score is there — you just have not earned it until the line reaches ${cfg.lineCap}.`,
            }
          : {
              label: 'Every placement banks immediately',
              detail: 'The preview shows exactly what a placement is worth before you commit to it.',
            },
    ],
  };

  const run: RuleSection = {
    title: 'This run',
    lines: [
      {
        label: `${cfg.placementsPerRun} ${m.lockAndCash ? 'actions' : 'placements'} to reach ${cfg.targetScore}`,
        detail: m.lockAndCash
          ? 'Placing a card and cashing a cross each cost one action.'
          : 'The target is calibrated so that playing well wins about half the time.',
      },
      cfg.handSize === 1
        ? {
            label: 'One card at a time',
            detail: `No hand to choose from — a single card is revealed and you either place it or burn it. You have ${cfg.discardsPerRun} burns.`,
          }
        : {
            label: `Hand of ${cfg.handSize}, ${cfg.discardsPerRun} discards`,
            detail: `A discard replaces up to ${cfg.maxDiscardSelection} cards and costs a charge, not a placement.`,
          },
    ],
  };

  return [placement, scoringWhen, run];
}

export function ScoringPanel({ ruleset, onClose }: { ruleset: Ruleset; onClose: () => void }) {
  const cfg = ruleset.config;
  const lens = getLens(cfg.lensId);
  const sections = [...lens.rules(cfg), ...structureSections(cfg)];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur" onClick={onClose}>
      <div
        className="panel mx-auto my-4 w-[min(48rem,calc(100vw-1.5rem))] rounded-lg p-3 min-[1280px]:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold tracking-tight">How scoring works</h2>
          <span className="text-[11px] uppercase tracking-wider text-neutral-500">
            {ruleset.name}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        <p className="mb-3 text-[12px] leading-snug text-neutral-400">{ruleset.blurb}</p>

        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.lines.map((line) => (
                  <div key={line.label} className="panel-inset rounded p-2">
                    <div className="text-[13px] font-semibold text-neutral-100">{line.label}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-neutral-400">
                      {line.detail}
                    </div>
                    {line.example && (
                      <div className="mt-1 font-mono text-[11px] text-sky-300">{line.example}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-snug text-neutral-500">
          Switch rules from the menu and open this again — every line above is read from the ruleset
          you are playing, so it changes with it.
        </p>
      </div>
    </div>
  );
}
