import type { LogRow } from './ScoreLog';
import { CardChip } from './CardFace';

/**
 * Takes over the hand tray's spot once a run ends — the hand is already
 * non-interactive at that point (`HandTray`'s `disabled` prop), so the space
 * is otherwise dead. Keeps the run-end screen off the board entirely rather
 * than layering a panel over it.
 */
export function RunEndPanel({
  status,
  score,
  target,
  best,
  onReplay,
}: {
  status: 'won' | 'lost';
  score: number;
  target: number;
  best: LogRow | null;
  onReplay: () => void;
}) {
  const won = status === 'won';
  return (
    <div className="panel animate-run-end flex flex-col items-center gap-2 rounded-lg p-3 text-center">
      <div
        className={`text-sm font-black uppercase tracking-wider ${won ? 'text-emerald-400' : 'text-rose-400'}`}
      >
        {won ? 'Target reached' : 'Run over'}
      </div>

      <div className="font-mono text-2xl font-black tabular-nums">
        <span className={won ? 'text-emerald-400' : 'text-neutral-100'}>{score}</span>
        <span className="text-neutral-600"> / </span>
        <span className="text-neutral-500">{target}</span>
      </div>

      {best && (
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span className="uppercase tracking-wider text-neutral-500">Best placement</span>
          <CardChip card={best.card} />
          <span className="font-mono text-[11px] text-neutral-600">@ {best.atLabel}</span>
          <span className="font-mono font-bold text-emerald-400">+{best.score}</span>
        </div>
      )}

      <button
        onClick={onReplay}
        className="mt-1 cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold active:bg-sky-500 min-[1280px]:hover:bg-sky-500"
      >
        Replay this seed
      </button>
    </div>
  );
}
