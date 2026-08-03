import { useEffect, useRef, useState } from 'react';
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

// Matches the score-fly travel time in App.tsx, so the number settles right as
// the flying total arrives rather than finishing early or trailing behind it.
const COUNT_UP_MS = 220;

/**
 * Tweens toward `value` whenever it changes, landing exactly on it. Skips the
 * tween under reduced motion, same as every other animation here.
 */
function useCountUp(value: number, ms: number): number {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return display;
}

function Stat({
  label,
  value,
  accent,
  scoreDisplay,
}: {
  label: string;
  value: string;
  accent?: string;
  scoreDisplay?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-neutral-500 min-[1280px]:text-[10px]">
        {label}
      </span>
      <span
        // The score-fly in App.tsx targets whichever copy of this is on
        // screen — mobile top bar or desktop aside — to fly the banked
        // points at.
        data-score-display={scoreDisplay ? '' : undefined}
        className={`font-mono text-base font-bold tabular-nums min-[1280px]:text-xl ${accent ?? 'text-neutral-100'}`}
      >
        {value}
      </span>
    </div>
  );
}

export function StatusBar({ state, cfg }: { state: RunSummary; cfg: Config }) {
  const displayScore = useCountUp(state.score, COUNT_UP_MS);
  const pct = Math.min(100, (displayScore / cfg.targetScore) * 100);

  return (
    <div className="panel rounded-lg p-2 min-[1280px]:p-3">
      <div className="flex items-end justify-between gap-4">
        <Stat
          label="Score / Target"
          value={`${displayScore} / ${cfg.targetScore}`}
          accent={state.score >= cfg.targetScore ? 'text-emerald-400' : 'text-neutral-100'}
          scoreDisplay
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
