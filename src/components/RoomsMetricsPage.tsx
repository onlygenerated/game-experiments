import { useMemo, useState } from 'react';
import { ROOM_METRICS, ROOM_METRICS_GENERATED, ROOM_METRICS_SEEDS, type RoomMetricsRow } from '../roomMetrics.generated';

type Key = 'clearPct' | 'reachedPct' | 'spread' | 'goalClearPct' | 'gap' | 'lift' | 'deepLift' | 'skill' | 'minCells' | 'threshold';

interface Column {
  key: Key;
  label: string;
  /** One line, shown under the table. The metrics are useless unmarked. */
  meaning: string;
  format: (v: number) => string;
  /** Bars only make sense where more is a stronger claim. */
  bar: boolean;
  /** Where the bar starts — see `MetricsPage`'s own `Column.base` for why a
   * ratio's floor is 1, not 0. */
  base: number;
  /** Shown when this column is null for a row. Every column but `spread` and
   * `skill` can be null on the reference row — see `RoomMetricsRow`'s own
   * doc comments for why each one has no answer for hex-sprawl. */
  nullTitle?: string;
}

const REFERENCE_NULL = 'Hex Sprawl has no exit or threshold, so this question has no answer for it.';

const COLUMNS: Column[] = [
  {
    key: 'clearPct',
    base: 0,
    label: 'Clear rate',
    meaning: 'Share of runs (best-move-now play) that reached an exit AND met the room’s score threshold. This is the actual room-clear condition, not a stand-in.',
    format: (v) => `${v}%`,
    bar: true,
    nullTitle: REFERENCE_NULL,
  },
  {
    key: 'reachedPct',
    base: 0,
    label: 'Reach %',
    meaning: 'Share of runs (best-move-now play) whose structure reached any exit at all, regardless of score. High and clearPct much lower means players get to the door but arrive short.',
    format: (v) => `${v}%`,
    bar: true,
    nullTitle: REFERENCE_NULL,
  },
  {
    key: 'spread',
    base: 0,
    label: 'Choice spread',
    meaning: 'Best move ÷ median move on a turn. Low means the options are close and you have to think; high means one move screams at you. Lower is better, so this column is not ranked by bar length. This is the flaw the room design exists to fix — compare every row against the Hex Sprawl reference line.',
    format: (v) => `×${v.toFixed(1)}`,
    bar: false,
  },
  {
    key: 'goalClearPct',
    base: 0,
    label: 'Goal-seeking clear %',
    meaning: 'Same clear condition, but for an agent that also values getting closer to an exit (item 13c), not score alone. Compare against Clear rate: the gap is what the reach condition is actually worth.',
    format: (v) => `${v}%`,
    bar: true,
    nullTitle: REFERENCE_NULL,
  },
  {
    key: 'gap',
    base: 0,
    label: 'Reach gap',
    meaning: 'Goal-seeking clear % − Clear rate. Near zero means the exit condition barely changes what a good player does; negative means chasing the door can cost clears once score is the binding constraint.',
    format: (v) => `${v > 0 ? '+' : ''}${v}`,
    bar: false,
    nullTitle: REFERENCE_NULL,
  },
  {
    key: 'lift',
    base: 1,
    label: '2-ply lift',
    meaning: 'Two-ply score ÷ greedy score. How much planning one move ahead is worth.',
    format: (v) => `×${v.toFixed(2)}`,
    bar: true,
  },
  {
    key: 'deepLift',
    base: 1,
    label: 'Deep lift',
    meaning: 'Beam-search (depth 3-4) score ÷ greedy score — the same question as 2-ply lift, asked with more search (item 13d).',
    format: (v) => `×${v.toFixed(2)}`,
    bar: true,
  },
  {
    key: 'skill',
    base: 1,
    label: 'Skill gap',
    meaning: 'Greedy score ÷ random-legal-play score. How much playing well is worth.',
    format: (v) => `×${v.toFixed(2)}`,
    bar: true,
    nullTitle: 'Random play scored zero, so the ratio measures nothing.',
  },
  {
    key: 'minCells',
    base: 0,
    label: 'Min cells',
    meaning: 'Fewest legal cells available after turn 5. Very low means the room chokes.',
    format: (v) => String(v),
    bar: false,
  },
  {
    key: 'threshold',
    base: 0,
    label: 'Threshold',
    meaning: 'The score a structure must reach, on top of touching an exit, to clear the room. Calibrated from the greedy agent’s own median (item 22), not chosen by eye.',
    format: (v) => String(v),
    bar: false,
    nullTitle: REFERENCE_NULL,
  },
];

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
      {over && <div className="absolute inset-y-0 right-0 w-1 bg-amber-300" aria-hidden />}
      {/* Where Hex Sprawl sits — every row is read against the pre-Rooms
          baseline this design exists to beat, the same role Poker Squares
          plays on the flat Metrics page. */}
      <div
        className="absolute inset-y-0 w-px bg-neutral-300"
        style={{ left: `${refPct}%` }}
        aria-hidden
      />
    </div>
  );
}

export function RoomsMetricsPage({ onClose }: { onClose: () => void }) {
  const [sortKey, setSortKey] = useState<Key>('clearPct');

  const reference = ROOM_METRICS.find((m) => m.reference);
  const rooms = useMemo(() => ROOM_METRICS.filter((m) => !m.reference), []);

  const rows = useMemo(() => {
    const val = (m: RoomMetricsRow) => m[sortKey] ?? -1;
    return [...rooms].sort((a, b) => val(b) - val(a));
  }, [rooms, sortKey]);

  // Scale bars to the rooms themselves — the reference row can sit well
  // outside a room's own range (Hex Sprawl's spread is the whole reason this
  // mode exists) and letting it set the scale would flatten every real
  // difference between rooms to nothing. Clamped and marked, not dropped.
  const max = useMemo(() => {
    const out = {} as Record<Key, number>;
    for (const col of COLUMNS) {
      out[col.key] = Math.max(...rooms.map((m) => m[col.key] ?? 0), 1);
    }
    return out;
  }, [rooms]);

  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Room Metrics</h1>
        <span className="text-[11px] text-neutral-500">
          medians over {ROOM_METRICS_SEEDS} seeds · generated {ROOM_METRICS_GENERATED} by{' '}
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
        Every run plays a room's full placement budget. The pale tick inside each bar marks{' '}
        <span className="text-neutral-200">Hex Sprawl</span> — the pre-Rooms baseline (item 3's
        post-additive recalibration) this design exists to beat. Rooms fixed the choice-spread
        pathology (median {reference ? reference.spread.toFixed(1) : '?'} → well below); planning
        ahead is worth less here than in open sprawl, not more — see item 22's own verdict in
        ROOMS.md for the full read.
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

      <p className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600">
        {/* Ten metric columns (two more than the flat Metrics page) overflow a
            1280px panel even on desktop, unlike that page's own hint which
            hides past that width — so this one stays visible at every size. */}
        scroll the table sideways for the rest of the columns
      </p>
      <div className="panel overflow-x-auto rounded-lg">
        <table className="w-full min-w-[760px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-neutral-500">
              <th className="sticky left-0 z-10 bg-[#171b24] px-2 py-2 font-bold">Room</th>
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
            {[...(reference ? [reference] : []), ...rows].map((m) => {
              const isRef = m.reference;
              return (
                <tr
                  key={m.label}
                  className={`border-b border-white/5 ${isRef ? 'bg-sky-500/10' : ''}`}
                >
                  <td
                    className={`sticky left-0 z-10 px-2 py-1.5 ${isRef ? 'bg-[#141d29]' : 'bg-[#171b24]'}`}
                  >
                    <span className={isRef ? 'font-bold text-sky-200' : 'text-neutral-200'}>
                      {m.label}
                    </span>
                    {isRef && (
                      <span className="ml-1.5 text-[9px] uppercase tracking-wider text-sky-400">
                        reference
                      </span>
                    )}
                  </td>
                  {COLUMNS.map((c) => {
                    const v = m[c.key];
                    return (
                      <td key={c.key} className="px-2 py-1.5 text-right align-middle">
                        {v === null ? (
                          <span className="text-neutral-600" title={c.nullTitle}>
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
      </div>
    </div>
  );
}
