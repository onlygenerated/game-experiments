import { useMemo } from 'react';
import { hexKey, hexToPixel, type Hex } from '../hex/coords';
import { isRoomBorder, roomCells, type Room } from './room';

/** Pointy-top, same silhouette as the sprawl's hex cells. */
const POINTY_TOP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

/**
 * Renders whatever shape a `Room` holds — no fixed radius, no cards, no
 * scoring. Border cells (item 5's future exit candidates) are tinted apart
 * from interior cells so a shape like the hourglass visibly shows its border
 * dipping into the middle rather than forming one outer ring.
 */
export function RoomBoardView({ room, size = 36 }: { room: Room; size?: number }) {
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
        return (
          <div
            key={k}
            data-room-cell={k}
            data-room-border={border}
            className="absolute flex items-center justify-center"
            style={{
              ...place(h),
              width: 1.733 * size,
              height: 2 * size,
              clipPath: POINTY_TOP,
              background: border ? 'rgba(244,114,182,.28)' : 'rgba(56,189,248,.16)',
              boxShadow: border
                ? 'inset 0 0 0 2px rgba(244,114,182,.75)'
                : 'inset 0 0 0 1px rgba(255,255,255,.08)',
            }}
          />
        );
      })}
    </div>
  );
}
