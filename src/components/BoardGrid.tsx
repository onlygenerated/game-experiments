import { useMemo } from 'react';
import type { Config } from '../config';
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
const TRAY_PAD = 8;

const key = (r: number, c: number) => `${r},${c}`;

export function BoardGrid({
  cfg,
  board,
  selectedCard,
  target,
  preview,
  cashable,
  justPlaced,
  onHoverCell,
  onActivateCell,
  interactive,
  docked,
}: {
  cfg: Config;
  board: Board;
  selectedCard: Card | null;
  target: Coord | null;
  preview: PlacementScore | null;
  /** Cells whose cross can still be banked. Empty unless lock-and-cash is on. */
  cashable: ReadonlySet<string>;
  /** Cell of the most recent placement, for the drop-in animation. */
  justPlaced: Coord | null;
  onHoverCell: (cell: Coord | null) => void;
  onActivateCell: (cell: Coord) => void;
  interactive: boolean;
  /** True when the preview lives in a docked sheet instead of beside the board. */
  docked: boolean;
}) {
  const size = cfg.gridSize;

  const legal = useMemo(() => {
    const s = new Set<string>();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isLegalPlacement(board, r, c, cfg)) s.add(key(r, c));
      }
    }
    return s;
  }, [board, size, cfg]);

  const rowPreview = useMemo(
    () => new Set(preview?.rowCoords.map((p) => key(p.r, p.c)) ?? []),
    [preview],
  );
  const colPreview = useMemo(
    () => new Set(preview?.colCoords.map((p) => key(p.r, p.c)) ?? []),
    [preview],
  );

  const gapTotal = (size - 1) * GAP;
  const gridWidth = `calc(var(--cell) * ${size} + ${gapTotal}px)`;
  const trayWidth = `calc(${gridWidth} + ${TRAY_PAD * 2}px)`;
  // The side lane only exists on wide screens, where --cell is pinned to 76px.
  const wideTrayPx = size * WIDE_CELL + gapTotal + TRAY_PAD * 2;

  const panelPos =
    !docked && target
      ? {
          left: wideTrayPx + 16,
          top: Math.min(
            Math.max(target.r * (WIDE_CELL + GAP) - 60, 0),
            Math.max(wideTrayPx - 300, 0),
          ),
        }
      : null;

  return (
    <div
      className="relative"
      style={{ width: docked ? trayWidth : wideTrayPx + 16 + PANEL_W }}
    >
      <div
        className="board-tray grid"
        style={{
          gridTemplateColumns: `repeat(${size}, var(--cell))`,
          gap: GAP,
          width: trayWidth,
          padding: TRAY_PAD,
          // Ruleset can change the board size, so --cell is derived here rather
          // than from the 7-wide default in index.css.
          ['--cell' as string]: `min(76px, calc((100vw - 2rem - ${gapTotal + TRAY_PAD * 2}px) / ${size}))`,
        }}
        onMouseLeave={() => onHoverCell(null)}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const r = Math.floor(i / size);
          const c = i % size;
          const card = board[idx(r, c, cfg)];
          const k = key(r, c);

          const isLegal = legal.has(k);
          const selectable = interactive && isLegal && selectedCard !== null;
          const isCashable = interactive && cashable.has(k);
          const isTarget = target?.r === r && target?.c === c;
          const isJustPlaced = justPlaced?.r === r && justPlaced?.c === c;

          // A cashed line is sealed: it can never be extended or banked again,
          // which is a stronger statement than merely being full.
          const lockedRow = Boolean(card?.lockedRow);
          const lockedCol = Boolean(card?.lockedCol);

          // Complete lines can never be extended. Mark the run's edges.
          const rowComplete = !lockedRow && card !== null && isLineComplete(board, r, c, 'row', cfg);
          const colComplete = !lockedCol && card !== null && isLineComplete(board, r, c, 'col', cfg);

          const inRowPreview = rowPreview.has(k) && !isTarget;
          const inColPreview = colPreview.has(k) && !isTarget;

          // A line-membership cell is usually occupied, so a tint alone is just
          // a thin frame around the card. The ring makes the run readable.
          let bg = 'transparent';
          let ring = '';
          if (selectable) bg = 'rgba(16,185,129,.13)';
          if (inRowPreview) {
            bg = 'rgba(14,165,233,.28)';
            ring = 'rgba(56,189,248,.95)';
          }
          if (inColPreview) {
            bg = 'rgba(245,158,11,.28)';
            ring = 'rgba(251,191,36,.95)';
          }
          if (isTarget && selectable) {
            bg = 'rgba(52,211,153,.34)';
            ring = 'rgba(110,231,183,.95)';
          }

          // Painted front-to-back. Line markers sit above the well shading so
          // they stay legible on an occupied cell.
          const shadows = [
            lockedRow
              ? 'inset 0 3px 0 0 rgba(120,113,108,.85), inset 0 -3px 0 0 rgba(120,113,108,.85)'
              : rowComplete
                ? 'inset 0 3px 0 0 rgba(167,139,250,.75), inset 0 -3px 0 0 rgba(167,139,250,.75)'
                : '',
            lockedCol
              ? 'inset 3px 0 0 0 rgba(120,113,108,.85), inset -3px 0 0 0 rgba(120,113,108,.85)'
              : colComplete
                ? 'inset 3px 0 0 0 rgba(244,114,182,.75), inset -3px 0 0 0 rgba(244,114,182,.75)'
                : '',
            ring ? `inset 0 0 0 2px ${ring}` : '',
            // A legal cell has to read at a glance — it is the whole affordance.
            selectable && !ring
              ? 'inset 0 0 0 1.5px rgba(52,211,153,.55), 0 0 14px rgba(16,185,129,.28)'
              : '',
            // Bankable crosses get the same treatment in gold, since under
            // lock-and-cash they are an affordance too, not just scenery.
            isCashable && !ring
              ? 'inset 0 0 0 1.5px rgba(251,191,36,.6), 0 0 14px rgba(245,158,11,.3)'
              : '',
            // Every cell is a shallow well with a lit rim, so the grid stays
            // legible; occupied ones are shallower since the card's own shadow
            // already reads as sitting on top.
            card
              ? 'inset 0 1px 3px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.05)'
              : 'inset 0 2px 5px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.055)',
          ].filter(Boolean);

          return (
            <div
              key={k}
              data-cell={k}
              onMouseEnter={() => onHoverCell({ r, c })}
              onClick={() => (selectable || isCashable) && onActivateCell({ r, c })}
              className={`flex items-center justify-center rounded-md transition-[background-color,box-shadow] duration-150 ${
                selectable || isCashable ? 'cursor-pointer' : ''
              }`}
              style={{
                width: 'var(--cell)',
                height: 'var(--cell)',
                // One shorthand only — React warns when `background` and
                // `backgroundColor` both target the same value. The tint rides
                // as the final layer, which is where the shorthand takes a colour.
                background: `${
                  card
                    ? 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(255,255,255,.03))'
                    : 'linear-gradient(180deg, rgba(0,0,0,.3), rgba(255,255,255,.05))'
                }, ${bg}`,
                boxShadow: shadows.join(', '),
              }}
            >
              {card ? (
                <CardFace card={card} className={isJustPlaced ? 'animate-place' : ''} />
              ) : isTarget && selectable && selectedCard ? (
                <CardFace card={selectedCard} style={{ opacity: 0.5 }} />
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
