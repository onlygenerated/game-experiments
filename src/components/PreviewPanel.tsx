import type { PlacementScore } from '../board';
import type { Card } from '../deck';
import { CardChip } from './CardFace';

/**
 * Side variant stacks label / cards / hand+value over three rows. Docked
 * variant flattens the same information onto one line, because vertical space
 * on a phone is the scarcest thing on the screen.
 */
function LineRow({
  axis,
  cards,
  handName,
  partial,
  value,
  valueLabel,
  accent,
  compact,
}: {
  axis: string;
  cards: Card[];
  handName: string;
  partial: boolean;
  value: string;
  valueLabel: string;
  accent: string;
  compact: boolean;
}) {
  const chips = (
    <span className="flex flex-wrap gap-0.5">
      {cards.map((c, i) => (
        <CardChip key={`${c.id}-${i}`} card={c} />
      ))}
    </span>
  );

  if (compact) {
    return (
      <div className="panel-inset flex items-center gap-2 rounded px-2 py-1.5">
        <span className={`shrink-0 text-[10px] font-bold uppercase ${accent}`}>{axis}</span>
        {chips}
        <span className="ml-auto shrink-0 text-right">
          <span className="mr-1.5 text-[11px] text-neutral-400">
            {handName}
            {partial && <span className="ml-1 text-amber-400">·p</span>}
          </span>
          <span className={`font-mono text-base font-bold ${accent}`}>{value}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="panel-inset rounded p-2">
      <div className="flex items-baseline justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${accent}`}>{axis}</span>
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">{valueLabel}</span>
      </div>
      <div className="mt-1">{chips}</div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-xs text-neutral-300">
          {handName}
          {partial && <span className="ml-1 text-[10px] text-amber-400">partial</span>}
          <span className="ml-1 text-neutral-600">({cards.length})</span>
        </span>
        <span className={`font-mono text-lg font-bold ${accent}`}>{value}</span>
      </div>
    </div>
  );
}

/**
 * The non-negotiable UI element: what this placement scores, before committing.
 * Row-line drives chips, col-line drives mult, and the product is spelled out.
 *
 * On a pointer device this floats beside the board and hover drives it. On
 * touch it docks to the bottom of the screen and gets explicit actions, since
 * a tap has to both target a cell and leave the preview readable.
 */
export function PreviewPanel({
  preview,
  onPlace,
  onCancel,
}: {
  preview: PlacementScore;
  onPlace?: () => void;
  onCancel?: () => void;
}) {
  const loneRow = preview.rowLine.length === 1;
  const loneCol = preview.colLine.length === 1;
  const docked = Boolean(onPlace);

  return (
    <div
      className={`panel space-y-1.5 rounded-lg p-2 backdrop-blur ${
        docked ? 'w-full' : 'w-72 space-y-2 p-3'
      }`}
    >
      <LineRow
        compact={docked}
        axis="Row"
        cards={preview.rowLine}
        handName={loneRow ? 'High Card (no bonus)' : preview.rowHand.handName}
        partial={!loneRow && preview.rowHand.partial}
        value={String(preview.chips)}
        valueLabel={
          loneRow
            ? `ranks ${preview.rankChipTotal}`
            : `${preview.handChips} + ${preview.rankChipTotal}`
        }
        accent="text-sky-400"
      />
      <LineRow
        compact={docked}
        axis="Col"
        cards={preview.colLine}
        handName={loneCol ? 'High Card' : preview.colHand.handName}
        partial={!loneCol && preview.colHand.partial}
        value={`×${preview.mult}`}
        valueLabel="mult"
        accent="text-amber-400"
      />

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
