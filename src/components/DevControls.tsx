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
    <div className="flex items-center gap-2">
      <label className="text-[10px] uppercase tracking-wider text-neutral-500">Seed</label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onNewRun(draft)}
        className="w-40 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-sm outline-none focus:border-sky-500"
      />
      <button
        onClick={() => onNewRun(draft)}
        className="cursor-pointer rounded bg-sky-600 px-3 py-1 text-sm font-semibold hover:bg-sky-500"
      >
        New run
      </button>
      <button
        onClick={() => {
          const s = String(Math.floor(Math.random() * 1e9));
          setDraft(s);
          onNewRun(s);
        }}
        className="cursor-pointer rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
      >
        Random seed
      </button>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`rounded px-3 py-1 text-sm font-semibold ${
          canUndo
            ? 'cursor-pointer bg-neutral-700 hover:bg-neutral-600'
            : 'cursor-not-allowed bg-neutral-800 text-neutral-600'
        }`}
      >
        Undo
      </button>
    </div>
  );
}
