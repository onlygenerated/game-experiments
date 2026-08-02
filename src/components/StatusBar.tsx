import type { Config } from '../config';

/** Structural minimum, so grid and hex runs both satisfy it. */
export interface RunSummary {
  score: number;
  deck: readonly unknown[];
  placementsLeft: number;
  discardsLeft: number;
  status: 'playing' | 'won' | 'lost';
  log: readonly unknown[];
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-neutral-500 min-[1280px]:text-[10px]">
        {label}
      </span>
      <span
        className={`font-mono text-base font-bold tabular-nums min-[1280px]:text-xl ${accent ?? 'text-neutral-100'}`}
      >
        {value}
      </span>
    </div>
  );
}

export function StatusBar({ state, cfg }: { state: RunSummary; cfg: Config }) {
  const pct = Math.min(100, (state.score / cfg.targetScore) * 100);

  return (
    <div className="panel rounded-lg p-2 min-[1280px]:p-3">
      <div className="flex items-end justify-between gap-4">
        <Stat
          label="Score / Target"
          value={`${state.score} / ${cfg.targetScore}`}
          accent={state.score >= cfg.targetScore ? 'text-emerald-400' : 'text-neutral-100'}
        />
        <Stat label="Placements" value={String(state.placementsLeft)} />
        <Stat label="Discards" value={String(state.discardsLeft)} />
        <Stat label="Deck" value={String(state.deck.length)} />
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-black/50 shadow-[inset_0_1px_2px_rgba(0,0,0,.6)]">
        <div
          className={`h-full rounded shadow-[0_0_8px_currentColor] ${state.score >= cfg.targetScore ? 'bg-emerald-400 text-emerald-400/50' : 'bg-sky-500 text-sky-500/50'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {state.status !== 'playing' && (
        <div
          className={`mt-1.5 rounded px-2 py-1 text-center text-sm font-bold ${
            state.status === 'won' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-rose-600/30 text-rose-300'
          }`}
        >
          {state.status === 'won'
            ? `WIN — ${state.score} in ${state.log.length} placements`
            : `LOSS — ${state.score} / ${cfg.targetScore}`}
        </div>
      )}
    </div>
  );
}
