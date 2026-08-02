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

const CELL = 76;
const GAP = 4;
const PITCH = CELL + GAP;
/** Keep in sync with the lane reserved for it in App.tsx. */
const PANEL_W = 288;

const key = (r: number, c: number) => `${r},${c}`;

export function BoardGrid({
  board,
  selectedCard,
  hovered,
  preview,
  onHoverCell,
  onPlace,
  interactive,
}: {
  board: Board;
  selectedCard: Card | null;
  hovered: Coord | null;
  preview: PlacementScore | null;
  onHoverCell: (cell: Coord | null) => void;
  onPlace: (cell: Coord) => void;
  interactive: boolean;
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

  const boardPx = size * CELL + (size - 1) * GAP;

  // Sits just outside the grid, tracking the hovered row. Anchoring it beside
  // the cell reads better but hides the cells you are comparing against.
  const panelPos = hovered
    ? {
        left: boardPx + 16,
        top: Math.min(Math.max(hovered.r * PITCH - 60, 0), Math.max(boardPx - 300, 0)),
      }
    : null;

  return (
    <div className="relative" style={{ width: boardPx + 16 + PANEL_W }}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${size}, ${CELL}px)`,
          gap: GAP,
          width: boardPx,
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
          const isHovered = hovered?.r === r && hovered?.c === c;

          // Complete lines can never be extended. Mark the run's edges.
          const rowComplete = card !== null && isLineComplete(board, r, c, 'row');
          const colComplete = card !== null && isLineComplete(board, r, c, 'col');

          const inRowPreview = rowPreview.has(k) && !isHovered;
          const inColPreview = colPreview.has(k) && !isHovered;

          // A line-membership cell is usually occupied, so the tint alone is
          // just a thin frame around the card. The ring makes the run readable.
          let bg = 'bg-neutral-900/40';
          if (card) bg = 'bg-neutral-800/40';
          if (selectable) bg = 'bg-emerald-500/15';
          if (inRowPreview) bg = 'bg-sky-500/30 ring-2 ring-sky-400';
          if (inColPreview) bg = 'bg-amber-500/30 ring-2 ring-amber-400';
          if (isHovered && selectable) bg = 'bg-emerald-400/30';

          return (
            <div
              key={k}
              onMouseEnter={() => onHoverCell({ r, c })}
              onClick={() => selectable && onPlace({ r, c })}
              className={`flex items-center justify-center rounded border transition-colors ${bg} ${
                selectable
                  ? 'cursor-pointer border-emerald-400/70'
                  : card
                    ? 'border-neutral-700'
                    : 'border-neutral-800/60'
              }`}
              style={{
                width: CELL,
                height: CELL,
                // Subtle edge accents on runs that have hit the cap.
                boxShadow: [
                  rowComplete ? 'inset 0 3px 0 0 rgba(167,139,250,.65), inset 0 -3px 0 0 rgba(167,139,250,.65)' : '',
                  colComplete ? 'inset 3px 0 0 0 rgba(244,114,182,.65), inset -3px 0 0 0 rgba(244,114,182,.65)' : '',
                ]
                  .filter(Boolean)
                  .join(', '),
              }}
            >
              {card ? (
                <CardFace card={card} />
              ) : isHovered && selectable && selectedCard ? (
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
