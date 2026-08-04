import { useMemo } from 'react';
import { CardFace } from '../components/CardFace';
import type { Card } from '../deck';
import { hexKey, hexToPixel, type Hex } from '../hex/coords';
import { isExit, isRoomBorder, roomCells, type Room } from './room';
import { tileAt } from './tile';

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
 *
 * Item 8 reads `room.tiles` directly (there is no separate prop for it —
 * a room's tiles are part of its shape, same as its exits) and renders each
 * tile's label as a small badge pinned to the top of its hex, centred
 * horizontally, rather than a plain corner: a pointy-top hex's `clipPath`
 * narrows sharply near its corners (the top vertex is a single point), so a
 * corner badge gets silently clipped away — verified by screenshotting a
 * first attempt that did exactly that. The centred card leaves the hex's
 * own top sliver (above where the card starts) untouched, which is where
 * the badge sits. That is what "rendering underneath cards so a placed card
 * does not hide what it landed on" means here: nothing is stacked *behind*
 * the card, the two simply don't occupy the same pixels.
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
        const tile = tileAt(room.tiles, h);
        return (
          <div
            key={k}
            data-room-cell={k}
            data-room-border={border}
            data-room-exit={exit}
            data-room-occupied={occupied}
            data-room-tile={tile?.kind}
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
            {tile && (
              <span
                className="absolute rounded bg-black/60 px-0.5 text-[8px] font-bold leading-none text-amber-200"
                style={{ pointerEvents: 'none', top: 0.22 * size, left: '50%', transform: 'translateX(-50%)' }}
              >
                {tile.label}
              </span>
            )}
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
