import { useEffect, useRef, useState } from 'react';
import { rulesetGroups, type Ruleset } from '../rulesets';

/**
 * The variant picker. Every experiment is a Config, so switching rules is a
 * menu choice rather than a branch of the codebase. Changing ruleset restarts
 * the run on the same seed, which is the whole point — two variants, one deck,
 * played back to back.
 */
export function RulesetMenu({
  current,
  onSelect,
}: {
  current: Ruleset;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 active:bg-neutral-800 min-[1280px]:py-1"
      >
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Rules</span>
        <span className="truncate">{current.name}</span>
        <span className="ml-auto text-neutral-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="panel absolute right-0 z-50 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-lg p-1">
          {rulesetGroups().map(({ group, items }) => (
            <div key={group}>
              <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {group}
              </div>
              {items.map((r) => {
                const active = r.id === current.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      onSelect(r.id);
                      setOpen(false);
                    }}
                    className={`block w-full rounded px-2 py-2 text-left transition-colors ${
                      active ? 'bg-emerald-600/25' : 'active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{r.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-500">
                        {r.config.targetScore}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-neutral-400">
                      {r.blurb}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
