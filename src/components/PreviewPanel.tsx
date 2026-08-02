import type { ScoredLine, ScoredPlacement } from '../lens';
import { CardChip } from './CardFace';

const ACCENT = { chips: 'text-sky-400', mult: 'text-amber-400' } as const;

/**
 * Side variant stacks label / cards / breakdown over several rows. Docked
 * variant flattens the same information, because vertical space on a phone is
 * the scarcest thing on the screen.
 *
 * Driven entirely by ScoredLine, so it renders two grid axes or three hex axes,
 * with poker hands or cribbage counts, without knowing which it has.
 */
function LineRow({
  line,
  compact,
}: {
  line: ScoredLine;
  compact: boolean;
}) {
  const accent = ACCENT[line.role];
  const value = line.role === 'mult' ? `×${line.value}` : String(line.value);
  // Uncapped lines can score only part of themselves.
  const clipped = line.windowKeys.length < line.cellKeys.length;

  const chips = (
    <span className="flex flex-wrap gap-0.5">
      {line.cards.map((c, i) => (
        <span key={`${c.id}-${i}`} className={clipped && !line.windowKeys.includes(line.cellKeys[i]) ? 'opacity-40' : ''}>
          <CardChip card={c} />
        </span>
      ))}
    </span>
  );

  if (compact) {
    return (
      <div className="panel-inset flex items-center gap-2 rounded px-2 py-1.5">
        <span className={`shrink-0 text-[10px] font-bold uppercase ${accent}`}>{line.label}</span>
        {chips}
        <span className="ml-auto shrink-0 text-right">
          <span className="mr-1.5 text-[11px] text-neutral-400">{line.result.name}</span>
          <span className={`font-mono text-base font-bold ${accent}`}>{value}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="panel-inset rounded p-2">
      <div className="flex items-baseline justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${accent}`}>
          {line.label}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          {clipped ? `best ${line.windowKeys.length} of ${line.cellKeys.length}` : `${line.cards.length} card${line.cards.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="mt-1">{chips}</div>

      {line.result.items.length > 0 && (
        <div className="mt-1.5 space-y-0.5 border-t border-white/5 pt-1.5">
          {line.result.items.map((item, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-neutral-400">{item.label}</span>
              <span className="font-mono text-neutral-300">{item.points}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex items-baseline justify-between border-t border-white/5 pt-1">
        <span className="text-xs text-neutral-300">{line.result.name}</span>
        <span className={`font-mono text-lg font-bold ${accent}`}>{value}</span>
      </div>
    </div>
  );
}

/**
 * The non-negotiable UI element: what this placement scores, before committing.
 * The product is always spelled out, whatever feeds it.
 */
export function PreviewPanel({
  preview,
  onPlace,
  onCancel,
}: {
  preview: ScoredPlacement;
  onPlace?: () => void;
  onCancel?: () => void;
}) {
  const docked = Boolean(onPlace);

  return (
    <div
      className={`panel space-y-1.5 rounded-lg p-2 backdrop-blur ${
        docked ? 'w-full' : 'w-72 space-y-2 p-3'
      }`}
    >
      {preview.lines.map((line, i) => (
        <LineRow key={i} line={line} compact={docked} />
      ))}

      {preview.notes.length > 0 && (
        <div className="panel-inset rounded px-2 py-1">
          {preview.notes.map((n, i) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-violet-300">{n.label}</span>
              <span className="font-mono text-violet-200">×{n.points}</span>
            </div>
          ))}
        </div>
      )}

      {docked ? (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-neutral-700 px-4 py-2.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={onPlace}
            className="flex flex-1 items-center justify-center gap-2 rounded bg-gradient-to-b from-emerald-500 to-emerald-700 py-2.5 font-mono text-base font-bold shadow-lg active:from-emerald-400 active:to-emerald-600"
          >
            <span className="text-sky-200">{preview.chips}</span>
            <span className="text-emerald-200/70">×</span>
            <span className="text-amber-200">{preview.mult}</span>
            <span className="text-emerald-200/70">=</span>
            <span className="text-lg font-black">{preview.score}</span>
            <span className="ml-1 font-sans text-sm">Place</span>
          </button>
        </div>
      ) : (
        <div className="panel-inset flex items-baseline justify-center gap-2 rounded py-2 font-mono">
          <span className="text-lg font-bold text-sky-400">{preview.chips}</span>
          <span className="text-neutral-500">×</span>
          <span className="text-lg font-bold text-amber-400">{preview.mult}</span>
          <span className="text-neutral-500">=</span>
          <span className="text-2xl font-black text-emerald-400">{preview.score}</span>
        </div>
      )}
    </div>
  );
}
