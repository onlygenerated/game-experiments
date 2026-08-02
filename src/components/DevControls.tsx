import { useState } from 'react';

/** Seed in, identical deck out. Plus undo, so a bad read can be replayed. */
export function DevControls({
  seed,
  onNewRun,
  onUndo,
  canUndo,
}: {
  seed: string;
  onNewRun: (seed: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [draft, setDraft] = useState(seed);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[10px] uppercase tracking-wider text-neutral-500">Seed</label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onNewRun(draft)}
        className="w-28 min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-sm outline-none focus:border-sky-500 min-[1280px]:w-40 min-[1280px]:flex-none"
      />
      <button
        onClick={() => onNewRun(draft)}
        className="cursor-pointer rounded bg-sky-600 px-3 py-2 text-sm font-semibold active:bg-sky-500 min-[1280px]:py-1 min-[1280px]:hover:bg-sky-500"
      >
        New run
      </button>
      <button
        onClick={() => {
          const s = String(Math.floor(Math.random() * 1e9));
          setDraft(s);
          onNewRun(s);
        }}
        className="cursor-pointer rounded border border-neutral-700 px-3 py-2 text-sm active:border-neutral-500 min-[1280px]:py-1 min-[1280px]:hover:border-neutral-500"
      >
        Random seed
      </button>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`rounded px-3 py-2 text-sm font-semibold min-[1280px]:py-1 ${
          canUndo
            ? 'cursor-pointer bg-neutral-700 active:bg-neutral-600 min-[1280px]:hover:bg-neutral-600'
            : 'cursor-not-allowed bg-neutral-800 text-neutral-600'
        }`}
      >
        Undo
      </button>
    </div>
  );
}
