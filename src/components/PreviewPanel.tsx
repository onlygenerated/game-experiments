import type { PlacementScore } from '../board';
import { CardChip } from './CardFace';

function LineRow({
  axis,
  cards,
  handName,
  partial,
  value,
  valueLabel,
  accent,
}: {
  axis: string;
  cards: PlacementScore['rowLine'];
  handName: string;
  partial: boolean;
  value: string;
  valueLabel: string;
  accent: string;
}) {
  return (
    <div className="rounded border border-neutral-700 bg-neutral-900/60 p-2">
      <div className="flex items-baseline justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${accent}`}>{axis}</span>
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          {valueLabel}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {cards.map((c, i) => (
          <CardChip key={`${c.id}-${i}`} card={c} />
        ))}
      </div>
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
 */
export function PreviewPanel({ preview }: { preview: PlacementScore }) {
  const loneRow = preview.rowLine.length === 1;
  const loneCol = preview.colLine.length === 1;

  return (
    <div className="w-72 space-y-2 rounded-lg border border-neutral-600 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur">
      <LineRow
        axis="Row line → chips"
        cards={preview.rowLine}
        handName={loneRow ? 'High Card (no bonus)' : preview.rowHand.handName}
        partial={!loneRow && preview.rowHand.partial}
        value={String(preview.chips)}
        valueLabel={loneRow ? `ranks ${preview.rankChipTotal}` : `${preview.handChips} + ${preview.rankChipTotal}`}
        accent="text-sky-400"
      />
      <LineRow
        axis="Col line → mult"
        cards={preview.colLine}
        handName={loneCol ? 'High Card' : preview.colHand.handName}
        partial={!loneCol && preview.colHand.partial}
        value={`×${preview.mult}`}
        valueLabel="mult"
        accent="text-amber-400"
      />
      <div className="flex items-baseline justify-center gap-2 rounded bg-neutral-800/80 py-2 font-mono">
        <span className="text-lg font-bold text-sky-400">{preview.chips}</span>
        <span className="text-neutral-500">×</span>
        <span className="text-lg font-bold text-amber-400">{preview.mult}</span>
        <span className="text-neutral-500">=</span>
        <span className="text-2xl font-black text-emerald-400">{preview.score}</span>
      </div>
    </div>
  );
}
