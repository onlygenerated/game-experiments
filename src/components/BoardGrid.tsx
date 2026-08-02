import { useMemo } from 'react';
import { CONFIG } from '../config';
import {
  idx,
  isLegalPlacement,
  isLineComplete,
  type Board,
  type Coord,
  type PlacementScore,
} from '../board';
import type { Card } from '../deck';
import { CardFace } from './CardFace';
import { PreviewPanel } from './PreviewPanel';

/** Desktop cell pitch. Narrow screens size cells from --cell instead. */
const WIDE_CELL = 76;
const GAP = 4;
const PANEL_W = 288;

const key = (r: number, c: number) => `${r},${c}`;

export function BoardGrid({
  board,
  selectedCard,
  target,
  preview,
  onHoverCell,
  onActivateCell,
  interactive,
  docked,
}: {
  board: Board;
  selectedCard: Card | null;
  target: Coord | null;
  preview: PlacementScore | null;
  onHoverCell: (cell: Coord | null) => void;
  onActivateCell: (cell: Coord) => void;
  interactive: boolean;
  /** True when the preview lives in a docked sheet instead of beside the board. */
  docked: boolean;
}) {
  const size = CONFIG.gridSize;

  const legal = useMemo(() => {
    const s = new Set<string>();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isLegalPlacement(board, r, c)) s.add(key(r, c));
      }
    }
    return s;
  }, [board, size]);

  const rowPreview = useMemo(
    () => new Set(preview?.rowCoords.map((p) => key(p.r, p.c)) ?? []),
    [preview],
  );
  const colPreview = useMemo(
    () => new Set(preview?.colCoords.map((p) => key(p.r, p.c)) ?? []),
    [preview],
  );

  const gapTotal = (size - 1) * GAP;
  const boardWidth = `calc(var(--cell) * ${size} + ${gapTotal}px)`;
  // The side lane only exists on wide screens, where --cell is pinned to 76px.
  const widePx = size * WIDE_CELL + gapTotal;

  const panelPos =
    !docked && target
      ? {
          left: widePx + 16,
          top: Math.min(Math.max(target.r * (WIDE_CELL + GAP) - 60, 0), Math.max(widePx - 300, 0)),
        }
      : null;

  return (
    <div
      className="relative"
      style={{ width: docked ? boardWidth : widePx + 16 + PANEL_W }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${size}, var(--cell))`,
          gap: GAP,
          width: boardWidth,
        }}
        onMouseLeave={() => onHoverCell(null)}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const r = Math.floor(i / size);
          const c = i % size;
          const card = board[idx(r, c)];
          const k = key(r, c);

          const isLegal = legal.has(k);
          const selectable = interactive && isLegal && selectedCard !== null;
          const isTarget = target?.r === r && target?.c === c;

          // Complete lines can never be extended. Mark the run's edges.
          const rowComplete = card !== null && isLineComplete(board, r, c, 'row');
          const colComplete = card !== null && isLineComplete(board, r, c, 'col');

          const inRowPreview = rowPreview.has(k) && !isTarget;
          const inColPreview = colPreview.has(k) && !isTarget;

          // A line-membership cell is usually occupied, so the tint alone is
          // just a thin frame around the card. The ring makes the run readable.
          let bg = 'bg-neutral-900/40';
          if (card) bg = 'bg-neutral-800/40';
          if (selectable) bg = 'bg-emerald-500/15';
          if (inRowPreview) bg = 'bg-sky-500/30 ring-2 ring-sky-400';
          if (inColPreview) bg = 'bg-amber-500/30 ring-2 ring-amber-400';
          if (isTarget && selectable) bg = 'bg-emerald-400/40 ring-2 ring-emerald-300';

          return (
            <div
              key={k}
              data-cell={k}
              onMouseEnter={() => onHoverCell({ r, c })}
              onClick={() => selectable && onActivateCell({ r, c })}
              className={`flex items-center justify-center rounded border transition-colors ${bg} ${
                selectable
                  ? 'cursor-pointer border-emerald-400/70'
                  : card
                    ? 'border-neutral-700'
                    : 'border-neutral-800/60'
              }`}
              style={{
                width: 'var(--cell)',
                height: 'var(--cell)',
                // Subtle edge accents on runs that have hit the cap.
                boxShadow: [
                  rowComplete
                    ? 'inset 0 3px 0 0 rgba(167,139,250,.65), inset 0 -3px 0 0 rgba(167,139,250,.65)'
                    : '',
                  colComplete
                    ? 'inset 3px 0 0 0 rgba(244,114,182,.65), inset -3px 0 0 0 rgba(244,114,182,.65)'
                    : '',
                ]
                  .filter(Boolean)
                  .join(', '),
              }}
            >
              {card ? (
                <CardFace card={card} />
              ) : isTarget && selectable && selectedCard ? (
                <div className="opacity-60">
                  <CardFace card={selectedCard} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {preview && panelPos && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: panelPos.left, top: panelPos.top }}
        >
          <PreviewPanel preview={preview} />
        </div>
      )}
    </div>
  );
}
