import { useMemo, useState } from 'react';
import { getRuleset } from '../rulesets';
import { METRICS, METRICS_GENERATED, METRICS_SEEDS, type RulesetMetrics } from '../metrics.generated';

const REFERENCE = 'reference-poker-squares';

type Key = 'skill' | 'lift' | 'multPct' | 'spread' | 'minCells' | 'greedy';

interface Column {
  key: Key;
  label: string;
  /** One line, shown under the table. The metrics are useless unmarked. */
  meaning: string;
  format: (v: number) => string;
  /** Bars only make sense where more is a stronger claim. */
  bar: boolean;
  /**
   * Where the bar starts. A ratio's meaningful floor is 1.00 — "playing well
   * changed nothing" — not zero, and drawing it from zero squashes a 1.03-to-
   * 1.43 spread into a row of nearly identical full bars.
   */
  base: number;
}

const COLUMNS: Column[] = [
  {
    key: 'lift',
    base: 1,
    label: 'Lookahead lift',
    meaning: 'Two-ply score ÷ greedy score. How much planning one move ahead is worth — the sharpest discriminator here, because a game with no setup plays sits at 1.00 however big its numbers are.',
    format: (v) => `×${v.toFixed(2)}`,
    bar: true,
  },
  {
    key: 'skill',
    base: 1,
    label: 'Skill gap',
    meaning: 'Greedy score ÷ random-legal-play score. How much playing well is worth. Only comparable between rulesets whose legal move sets are a similar size and shape — read it next to min cells.',
    format: (v) => `×${v.toFixed(2)}`,
    bar: true,
  },
  {
    key: 'multPct',
    base: 0,
    label: 'Mult live',
    meaning: 'Share of placements where the mult axis contributed more than ×1. The PRD asked whether splitting chips and mult across the axes creates tension; a low number means the mult axis is decoration.',
    format: (v) => `${v}%`,
    bar: true,
  },
  {
    key: 'spread',
    base: 0,
    label: 'Choice spread',
    meaning: 'Best move ÷ median move on a turn. Low means the options are close and you have to think; high means one move screams at you. Lower is better, so this column is not ranked by bar length.',
    format: (v) => `×${v.toFixed(1)}`,
    bar: false,
  },
  {
    key: 'minCells',
    base: 0,
    label: 'Min cells',
    meaning: 'Fewest legal cells available after turn 5. Very low means the board chokes; very high means placement is barely constrained at all.',
    format: (v) => String(v),
    bar: false,
  },
  {
    key: 'greedy',
    base: 0,
    label: 'Greedy score',
    meaning: 'Median final score for best-move-now play, over the full placement budget. Targets are calibrated from this, so it sits near each ruleset‘s target by construction.',
    format: (v) => String(v),
    bar: false,
  },
];

/**
 * Why a row's numbers cannot be read straight. Derived from the ruleset's own
 * config rather than hand-maintained, so a new variant that trips one of these
 * conditions is flagged without anyone remembering to do it.
 */
function caveats(id: string): string[] {
  const m = getRuleset(id).config.mechanics;
  const out: string[] = [];
  if (m.payOnCompleteOnly || m.lockAndCash) out.push('greedy');
  if (!m.requireAdjacency) out.push('open');
  return out;
}

const CAVEAT_TEXT: Record<string, string> = {
  greedy:
    'Placements are worth nothing on their own here, so a best-move-now agent has no gradient to follow. Its greedy score, and every ratio derived from it, understates the ruleset rather than measuring it.',
  open: 'No adjacency requirement, so the legal move set is several times larger and most of it is worthless. That inflates the skill gap without good play having improved.',
};

function Bar({
  value,
  max,
  base,
  reference,
}: {
  value: number;
  max: number;
  base: number;
  reference: number;
}) {
  const span = Math.max(max - base, 1e-6);
  const at = (v: number) => Math.max(0, Math.min(100, ((v - base) / span) * 100));
  const over = value > max;
  const pct = at(value);
  const refPct = at(reference);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-sm bg-white/5">
      <div
        className={`h-full bg-emerald-500/70 ${over ? '' : 'rounded-r-sm'}`}
        style={{ width: `${pct}%` }}
      />
      {/* Off the end of the scale. The printed number still says how far. */}
      {over && <div className="absolute inset-y-0 right-0 w-1 bg-amber-300" aria-hidden />}
      {/* Where Poker Squares sits, so every row is read against the classic
          rather than against the best row in the table. */}
      <div
        className="absolute inset-y-0 w-px bg-neutral-300"
        style={{ left: `${refPct}%` }}
        aria-hidden
      />
    </div>
  );
}

export function MetricsPage({ onClose }: { onClose: () => void }) {
  const [sortKey, setSortKey] = useState<Key>('lift');

  const reference = METRICS.find((m) => m.id === REFERENCE);

  const rows = useMemo(() => {
    const val = (m: RulesetMetrics) => m[sortKey] ?? -1;
    return [...METRICS].sort((a, b) => val(b) - val(a));
  }, [sortKey]);

  // Scale the bars to the rulesets whose numbers can be read straight. A
  // caveated row can be an order of magnitude out — lock-and-cash's ×29 lift
  // is an artefact of greedy collapsing, not a result — and letting it set the
  // scale flattens every real difference in the column to nothing. Rows past
  // the end are clamped and marked rather than dropped.
  const max = useMemo(() => {
    const clean = METRICS.filter((m) => caveats(m.id).length === 0);
    const out = {} as Record<Key, number>;
    for (const col of COLUMNS) {
      out[col.key] = Math.max(...clean.map((m) => m[col.key] ?? 0), 1);
    }
    return out;
  }, []);

  const usedCaveats = [...new Set(METRICS.flatMap((m) => caveats(m.id)))];

  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Metrics</h1>
        <span className="text-[11px] text-neutral-500">
          medians over {METRICS_SEEDS} seeds · generated {METRICS_GENERATED} by{' '}
          <code className="text-neutral-400">npm run probe</code>
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Back to the board
        </button>
      </div>

      <p className="mb-3 max-w-3xl text-[12px] leading-snug text-neutral-400">
        Every run plays its full placement budget rather than stopping on a win, so scores stay
        comparable across rulesets with different targets. The pale tick inside each bar marks{' '}
        <span className="text-neutral-200">Poker Squares</span> — the closest these rules come to
        the published classic, and the thing any of this has to beat to be worth building.
      </p>

      <div className="mb-2 flex flex-wrap gap-1">
        {COLUMNS.filter((c) => c.bar || c.key === sortKey).map((c) => (
          <button
            key={c.key}
            onClick={() => setSortKey(c.key)}
            className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
              sortKey === c.key
                ? 'bg-emerald-600/30 text-emerald-200'
                : 'text-neutral-400 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800'
            }`}
          >
            sort by {c.label.toLowerCase()}
          </button>
        ))}
      </div>

      <p className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600 min-[1280px]:hidden">
        scroll the table sideways for the rest of the columns
      </p>
      <div className="panel overflow-x-auto rounded-lg">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-neutral-500">
              <th className="sticky left-0 z-10 bg-[#171b24] px-2 py-2 font-bold">Ruleset</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-bold">
                  <button
                    onClick={() => setSortKey(c.key)}
                    className={sortKey === c.key ? 'text-emerald-300' : ''}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const rs = getRuleset(m.id);
              const flags = caveats(m.id);
              const isRef = m.id === REFERENCE;
              return (
                <tr
                  key={m.id}
                  className={`border-b border-white/5 ${isRef ? 'bg-sky-500/10' : ''}`}
                >
                  {/* Sticky so the row keeps its name while the numbers are
                      scrolled sideways on a phone. */}
                  <td
                    className={`sticky left-0 z-10 px-2 py-1.5 ${isRef ? 'bg-[#141d29]' : 'bg-[#171b24]'}`}
                  >
                    <span className={isRef ? 'font-bold text-sky-200' : 'text-neutral-200'}>
                      {rs.name}
                    </span>
                    {isRef && (
                      <span className="ml-1.5 text-[9px] uppercase tracking-wider text-sky-400">
                        reference
                      </span>
                    )}
                    {flags.map((f) => (
                      <span
                        key={f}
                        title={CAVEAT_TEXT[f]}
                        className="ml-1 rounded bg-amber-400/15 px-1 text-[9px] font-bold uppercase text-amber-300"
                      >
                        {f}
                      </span>
                    ))}
                  </td>
                  {COLUMNS.map((c) => {
                    const v = m[c.key];
                    return (
                      <td key={c.key} className="px-2 py-1.5 text-right align-middle">
                        {v === null ? (
                          <span className="text-neutral-600" title="Random play scored zero, so the ratio measures nothing.">
                            —
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {c.bar && (
                              <div className="hidden w-20 min-[1280px]:block">
                                <Bar
                                  value={v}
                                  max={max[c.key]}
                                  base={c.base}
                                  reference={reference?.[c.key] ?? 0}
                                />
                              </div>
                            )}
                            <span
                              className={`font-mono tabular-nums ${
                                sortKey === c.key ? 'font-bold text-emerald-300' : 'text-neutral-300'
                              }`}
                            >
                              {c.format(v)}
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-2">
        {COLUMNS.map((c) => (
          <div key={c.key} className="text-[11px] leading-snug">
            <span className="font-bold text-neutral-200">{c.label}</span>{' '}
            <span className="text-neutral-400">{c.meaning}</span>
          </div>
        ))}
        {usedCaveats.map((f) => (
          <div key={f} className="text-[11px] leading-snug">
            <span className="rounded bg-amber-400/15 px-1 text-[9px] font-bold uppercase text-amber-300">
              {f}
            </span>{' '}
            <span className="text-neutral-400">{CAVEAT_TEXT[f]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
