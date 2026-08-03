import { useMemo } from 'react';
import type { Config } from '../config';
import type { Card } from '../deck';
import {
  hexAt,
  isLegalHexPlacement,
  type HexBoard,
  type HexPlacementScore,
} from '../hex/board';
import { hexesWithinRadius, hexKey, hexToPixel, type Hex } from '../hex/coords';
import type { Cascade } from './cascade';
import { CardFace } from './CardFace';

/** Pointy-top: width is √3·R, height is 2R. */
const POINTY_TOP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

export function HexBoardView({
  cfg,
  board,
  selectedCard,
  target,
  preview,
  justPlaced,
  onHoverCell,
  onActivateCell,
  interactive,
  dragActive,
  cascade,
}: {
  cfg: Config;
  board: HexBoard;
  selectedCard: Card | null;
  target: Hex | null;
  preview: HexPlacementScore | null;
  justPlaced: Hex | null;
  onHoverCell: (cell: Hex | null) => void;
  onActivateCell: (cell: Hex) => void;
  interactive: boolean;
  /** True while a card is being dragged, so the cell under the pointer can lift. */
  dragActive: boolean;
  /** Cells to light one at a time after the most recent score, chips axis then mult. */
  cascade: Cascade | null;
}) {
  const cells = useMemo(() => hexesWithinRadius(cfg.hexRadius), [cfg.hexRadius]);

  // Hex size shrinks with the viewport the same way --cell does on the grid.
  // A radius-N disc spans (2N+1) hex widths across.
  const across = 2 * cfg.hexRadius + 1;
  const size = `min(42px, calc((100vw - 2.5rem) / ${across} / 1.733))`;

  const legal = useMemo(() => {
    const s = new Set<string>();
    for (const h of cells) if (isLegalHexPlacement(board, h, cfg)) s.add(hexKey(h));
    return s;
  }, [board, cells, cfg]);

  // Full runs highlight; the scoring window highlights harder.
  const { runKeys, windowKeys } = useMemo(() => {
    const run = new Map<string, 'chips' | 'mult'>();
    const win = new Map<string, 'chips' | 'mult'>();
    for (const l of preview?.lines ?? []) {
      for (const k of l.cellKeys) if (!run.has(k)) run.set(k, l.role);
      for (const k of l.windowKeys) if (!win.has(k)) win.set(k, l.role);
    }
    return { runKeys: run, windowKeys: win };
  }, [preview]);

  // Lay out from real pixel positions so the disc is centred and tight.
  const { width, height, place } = useMemo(() => {
    const pts = cells.map((h) => hexToPixel(h, 1));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    return {
      width: `calc((${maxX - minX} + 1.733) * ${size})`,
      height: `calc((${maxY - minY} + 2) * ${size})`,
      place: (h: Hex) => {
        const p = hexToPixel(h, 1);
        return {
          left: `calc((${p.x - minX}) * ${size})`,
          top: `calc((${p.y - minY}) * ${size})`,
        };
      },
    };
  }, [cells, size]);

  const targetKey = target ? hexKey(target) : null;
  const justPlacedKey = justPlaced ? hexKey(justPlaced) : null;

  return (
    <div
      className="board-tray relative"
      style={{ width, height, padding: 0 }}
      onMouseLeave={() => onHoverCell(null)}
    >
      {cells.map((h) => {
        const k = hexKey(h);
        const card = hexAt(board, h);
        const selectable = interactive && legal.has(k) && selectedCard !== null;
        const isTarget = targetKey === k;
        const isLifted = isTarget && selectable && dragActive;
        const inWindow = windowKeys.get(k);
        const inRun = runKeys.get(k);
        const cascadeHit = cascade?.cells.get(k);

        let bg = 'rgba(0,0,0,.34)';
        let ring = '';
        if (selectable) bg = 'rgba(16,185,129,.16)';
        // A run outside the scoring window is tinted but not ringed, so the
        // stretch that actually counts stays distinguishable from the rest.
        if (inRun && !inWindow) {
          bg = inRun === 'chips' ? 'rgba(14,165,233,.16)' : 'rgba(245,158,11,.16)';
        }
        if (inWindow) {
          bg = inWindow === 'chips' ? 'rgba(14,165,233,.34)' : 'rgba(245,158,11,.34)';
          ring = inWindow === 'chips' ? 'rgba(56,189,248,.95)' : 'rgba(251,191,36,.95)';
        }
        if (isTarget && selectable) {
          bg = 'rgba(52,211,153,.4)';
          ring = 'rgba(110,231,183,.95)';
        }

        return (
          <div
            key={k}
            data-hex={k}
            onMouseEnter={() => onHoverCell(h)}
            onClick={() => selectable && onActivateCell(h)}
            className={`absolute flex items-center justify-center transition-[background-color,transform] duration-150 ${
              selectable ? 'cursor-pointer' : ''
            }`}
            style={{
              ...place(h),
              width: `calc(1.733 * ${size})`,
              height: `calc(2 * ${size})`,
              clipPath: POINTY_TOP,
              background: bg,
              boxShadow: ring ? `inset 0 0 0 3px ${ring}` : undefined,
              // clip-path cuts the shadow, so the rim is drawn as an inset ring.
              outline: selectable && !ring ? 'none' : undefined,
              // The lift itself; clip-path already crops any drop-shadow we
              // could add here, so a small translate is what "under the
              // pointer" gets on the hex board instead of a bigger shadow.
              transform: isLifted ? 'translateY(-3px)' : undefined,
            }}
          >
            {/* clip-path clips borders too, so every rim is drawn as an inset
                layer. Without one the empty hexes vanish and the disc reads as
                a lopsided smear rather than a board. */}
            {!ring && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  clipPath: POINTY_TOP,
                  boxShadow: selectable
                    ? 'inset 0 0 0 2px rgba(52,211,153,.6)'
                    : 'inset 0 0 0 1.5px rgba(255,255,255,.07)',
                }}
              />
            )}
            {card ? (
              <CardFace
                card={card}
                className={justPlacedKey === k ? 'animate-place' : ''}
                style={{
                  width: `calc(1.05 * ${size})`,
                  height: `calc(1.35 * ${size})`,
                  fontSize: `calc(0.42 * ${size})`,
                }}
              />
            ) : isTarget && selectable && selectedCard ? (
              <CardFace
                card={selectedCard}
                style={{
                  width: `calc(1.05 * ${size})`,
                  height: `calc(1.35 * ${size})`,
                  fontSize: `calc(0.42 * ${size})`,
                  opacity: 0.5,
                }}
              />
            ) : null}
            {cascadeHit && (
              <div
                key={`${cascade!.id}-${k}`}
                className={`cascade-flash pointer-events-none absolute inset-0 ${
                  cascadeHit.role === 'chips' ? 'cascade-flash-chips' : 'cascade-flash-mult'
                }`}
                style={{ clipPath: POINTY_TOP, animationDelay: `${cascadeHit.delay}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
