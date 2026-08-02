import type { ScoredLine, ScoredPlacement } from '../lens';
import { CardChip } from './CardFace';

/** One placement, flattened so grid and hex runs render identically. */
export interface LogRow extends ScoredPlacement {
  n: number;
  totalAfter: number;
  /** Where it landed, already formatted — "3,4" or "q1,r-2". */
  atLabel: string;
}

const ACCENT = { chips: 'text-sky-400', mult: 'text-amber-400' } as const;

function Line({ line }: { line: ScoredLine }) {
  const accent = ACCENT[line.role];
  const clipped = line.windowKeys.length < line.cellKeys.length;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-[5.5rem] shrink-0 truncate text-[10px] font-bold uppercase ${accent}`}>
        {line.label}
      </span>
      <span className="flex flex-wrap gap-0.5">
        {line.cards.map((c, i) => (
          <span
            key={`${c.id}-${i}`}
            className={clipped && !line.windowKeys.includes(line.cellKeys[i]) ? 'opacity-40' : ''}
          >
            <CardChip card={c} />
          </span>
        ))}
      </span>
      <span
        className="ml-auto shrink-0 text-[11px] text-neutral-400"
        title={line.result.items.map((i) => `${i.label} ${i.points}`).join(' · ')}
      >
        {line.result.name}
      </span>
    </div>
  );
}

/**
 * The primary instrument for judging whether the math feels good. One row per
 * placement, newest first, with the full chips × mult breakdown.
 */
export function ScoreLog({ log }: { log: LogRow[] }) {
  return (
    <div className="panel flex flex-col rounded-lg min-[1280px]:min-h-0 min-[1280px]:flex-1">
      <div className="border-b border-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        Score log
      </div>

      <div className="space-y-2 p-2 min-[1280px]:min-h-0 min-[1280px]:flex-1 min-[1280px]:overflow-y-auto">
        {log.length === 0 && <div className="p-3 text-sm text-neutral-600">No placements yet.</div>}

        {log
          .slice()
          .reverse()
          .map((e) => (
            <div key={e.n} className="panel-inset rounded p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[10px] text-neutral-500">#{e.n}</span>
                <CardChip card={e.card} />
                <span className="font-mono text-[10px] text-neutral-600">@ {e.atLabel}</span>
                <span className="ml-auto font-mono text-[10px] text-neutral-500">
                  total {e.totalAfter}
                </span>
              </div>

              <div className="space-y-1">
                {e.lines.map((line, i) => (
                  <Line key={i} line={line} />
                ))}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5 border-t border-white/5 pt-1.5 font-mono text-sm">
                <span className="font-bold text-sky-400">{e.chips}</span>
                <span className="text-neutral-500">×</span>
                <span className="font-bold text-amber-400">{e.mult}</span>
                {e.notes.map((n, i) => (
                  <span key={i} className="text-[10px] text-violet-300">
                    ×{n.points}
                  </span>
                ))}
                <span className="text-neutral-500">=</span>
                <span className="ml-auto text-lg font-black text-emerald-400">{e.score}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
