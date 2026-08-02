import { CONFIG } from '../config';
import type { GameState } from '../game';

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      <span className={`font-mono text-xl font-bold ${accent ?? 'text-neutral-100'}`}>{value}</span>
    </div>
  );
}

export function StatusBar({ state }: { state: GameState }) {
  const pct = Math.min(100, (state.score / CONFIG.targetScore) * 100);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="flex items-end justify-between gap-4">
        <Stat
          label="Score / Target"
          value={`${state.score} / ${CONFIG.targetScore}`}
          accent={state.score >= CONFIG.targetScore ? 'text-emerald-400' : 'text-neutral-100'}
        />
        <Stat label="Placements" value={String(state.placementsLeft)} />
        <Stat label="Discards" value={String(state.discardsLeft)} />
        <Stat label="Deck" value={String(state.deck.length)} />
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-neutral-800">
        <div
          className={`h-full ${state.score >= CONFIG.targetScore ? 'bg-emerald-400' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {state.status !== 'playing' && (
        <div
          className={`mt-2 rounded px-2 py-1 text-center text-sm font-bold ${
            state.status === 'won' ? 'bg-emerald-600/30 text-emerald-300' : 'bg-rose-600/30 text-rose-300'
          }`}
        >
          {state.status === 'won'
            ? `WIN — ${state.score} in ${state.log.length} placements`
            : `LOSS — ${state.score} / ${CONFIG.targetScore}`}
        </div>
      )}
    </div>
  );
}
