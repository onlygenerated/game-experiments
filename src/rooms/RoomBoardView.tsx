import { useMemo } from 'react';
import { CardFace } from '../components/CardFace';
import type { Card } from '../deck';
import { hexKey, hexToPixel, type Hex } from '../hex/coords';
import { isExit, isRoomBorder, roomCells, type Room } from './room';

/** Pointy-top, same silhouette as the sprawl's hex cells. */
const POINTY_TOP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

/**
 * Renders whatever shape a `Room` holds — no fixed radius, no scoring yet.
 * Border cells are tinted apart from interior cells so a shape like the
 * hourglass visibly shows its border dipping into the middle rather than
 * forming one outer ring. Exits (item 5) get a third tint on top of that.
 *
 * `structure`, `board` and `onCellClick` are all optional so item 4's
 * shape-only callers keep working unchanged. `structure` is a bare set of
 * occupied keys (the dev preview's click-to-toggle stand-in structure);
 * `board` is a real `HexBoard` of placed cards (item 7's actual room run) —
 * when given, it wins over `structure` for occupancy and each occupied cell
 * renders the real card instead of a plain dot, so a room in play reads the
 * same way the sprawl does.
 */
export function RoomBoardView({
  room,
  size = 36,
  structure,
  board,
  onCellClick,
}: {
  room: Room;
  size?: number;
  structure?: ReadonlySet<string>;
  board?: ReadonlyMap<string, Card>;
  onCellClick?: (h: Hex) => void;
}) {
  const cells = useMemo(() => roomCells(room), [room]);

  const { width, height, place } = useMemo(() => {
    const pts = cells.map((h) => hexToPixel(h, 1));
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    return {
      width: (maxX - minX + 1.733) * size,
      height: (maxY - minY + 2) * size,
      place: (h: Hex) => {
        const p = hexToPixel(h, 1);
        return { left: (p.x - minX) * size, top: (p.y - minY) * size };
      },
    };
  }, [cells, size]);

  return (
    <div data-room={room.name} className="relative" style={{ width, height }}>
      {cells.map((h) => {
        const k = hexKey(h);
        const border = isRoomBorder(room, h);
        const exit = isExit(room, h);
        const card = board?.get(k);
        const occupied = card !== undefined || (structure?.has(k) ?? false);
        return (
          <div
            key={k}
            data-room-cell={k}
            data-room-border={border}
            data-room-exit={exit}
            data-room-occupied={occupied}
            onClick={onCellClick ? () => onCellClick(h) : undefined}
            className="absolute flex items-center justify-center text-[10px] font-bold text-white/80"
            style={{
              ...place(h),
              width: 1.733 * size,
              height: 2 * size,
              clipPath: POINTY_TOP,
              cursor: onCellClick ? 'pointer' : undefined,
              background: exit
                ? 'rgba(74,222,128,.35)'
                : border
                  ? 'rgba(244,114,182,.28)'
                  : 'rgba(56,189,248,.16)',
              boxShadow: occupied
                ? 'inset 0 0 0 3px rgba(250,204,21,.9)'
                : exit
                  ? 'inset 0 0 0 2px rgba(74,222,128,.85)'
                  : border
                    ? 'inset 0 0 0 2px rgba(244,114,182,.75)'
                    : 'inset 0 0 0 1px rgba(255,255,255,.08)',
            }}
          >
            {card ? (
              <CardFace
                card={card}
                style={{
                  width: 1.05 * size,
                  height: 1.35 * size,
                  fontSize: 0.42 * size,
                }}
              />
            ) : exit ? (
              'EXIT'
            ) : occupied ? (
              '●'
            ) : (
              ''
            )}
          </div>
        );
      })}
    </div>
  );
}
