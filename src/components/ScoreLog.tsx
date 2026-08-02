import type { LogEntry } from '../game';
import type { Card } from '../deck';
import { CardChip } from './CardFace';

function Line({
  label,
  cards,
  handName,
  partial,
  accent,
}: {
  label: string;
  cards: Card[];
  handName: string;
  partial: boolean;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-8 shrink-0 text-[10px] font-bold uppercase ${accent}`}>{label}</span>
      <span className="flex flex-wrap gap-0.5">
        {cards.map((c, i) => (
          <CardChip key={`${c.id}-${i}`} card={c} />
        ))}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-neutral-400">
        {handName}
        {partial && <span className="ml-1 text-amber-400">·p</span>}
      </span>
    </div>
  );
}

/**
 * The primary instrument for judging whether the math feels good. One row per
 * placement, newest first, with the full chips × mult breakdown.
 */
export function ScoreLog({ log }: { log: LogEntry[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="border-b border-neutral-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        Score log
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {log.length === 0 && (
          <div className="p-3 text-sm text-neutral-600">No placements yet.</div>
        )}

        {log
          .slice()
          .reverse()
          .map((e) => (
            <div key={e.n} className="rounded border border-neutral-800 bg-neutral-950/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-[10px] text-neutral-500">#{e.n}</span>
                <CardChip card={e.card} />
                <span className="font-mono text-[10px] text-neutral-600">
                  @ {e.at.r},{e.at.c}
                </span>
                <span className="ml-auto font-mono text-[10px] text-neutral-500">
                  total {e.totalAfter}
                </span>
              </div>

              <div className="space-y-1">
                <Line
                  label="Row"
                  cards={e.rowLine}
                  handName={e.rowLine.length === 1 ? 'High Card (no bonus)' : e.rowHand.handName}
                  partial={e.rowLine.length > 1 && e.rowHand.partial}
                  accent="text-sky-400"
                />
                <Line
                  label="Col"
                  cards={e.colLine}
                  handName={e.colLine.length === 1 ? 'High Card' : e.colHand.handName}
                  partial={e.colLine.length > 1 && e.colHand.partial}
                  accent="text-amber-400"
                />
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5 border-t border-neutral-800 pt-1.5 font-mono text-sm">
                <span className="font-bold text-sky-400">{e.chips}</span>
                <span className="text-[10px] text-neutral-600">
                  ({e.handChips}+{e.rankChipTotal})
                </span>
                <span className="text-neutral-500">×</span>
                <span className="font-bold text-amber-400">{e.mult}</span>
                <span className="text-neutral-500">=</span>
                <span className="ml-auto text-lg font-black text-emerald-400">{e.score}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
