import { useMemo } from 'react';
import { CardFace } from '../components/CardFace';
import type { Card } from '../deck';
import { hexKey, hexToPixel, type Hex } from '../hex/coords';
import { isExit, isRoomBorder, roomCells, type Room } from './room';
import { tileAt, tileBadge } from './tile';

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
 *
 * Item 11 adds a fourth cell tint for `'blocked'` tiles — a dark stone fill
 * that overrides the border/exit/interior colouring rather than layering on
 * top of it, so a blocked cell reads as "not part of the playable shape"
 * even where it sits on the border. It gets the same badge treatment as
 * every other tile kind, no special-casing there.
 *
 * Item 12 adds `'trap'`, the one kind with "hidden before, revealed on
 * trigger" state — and that state lives on the expedition, not the room
 * (see `tile.ts`/`expedition.ts`), so this view needs a new optional
 * `revealedTraps` prop to know which trap cells to actually show. A trap
 * whose key isn't in that set is treated as if there were no tile there at
 * all: no badge, no distinct tint, indistinguishable from a plain cell —
 * that is what "hidden" means. Once revealed it gets a fifth tint (rose),
 * layered the same way `'blocked'`'s is.
 *
 * Item 13 adds `'artifact'`, always visible (no hidden/revealed state —
 * unlike a trap the point is to be seen so a player can choose to detour
 * toward it) but with a *collected* fact, so this view needs one further
 * optional prop, `collectedArtifacts`. It gets a sixth tint (gold) like any
 * other special cell while uncollected, and the same non-placeable cursor
 * `'blocked'` cells get (the card sitting there isn't an empty slot). Once
 * collected the tint dims rather than disappearing — unlike a trap's reveal,
 * which is a one-time discovery, an artifact stays a landmark on the board
 * for the rest of the room.
 */
export function RoomBoardView({
  room,
  size = 36,
  structure,
  board,
  onCellClick,
  revealedTraps,
  collectedArtifacts,
}: {
  room: Room;
  size?: number;
  structure?: ReadonlySet<string>;
  board?: ReadonlyMap<string, Card>;
  onCellClick?: (h: Hex) => void;
  revealedTraps?: ReadonlySet<string>;
  collectedArtifacts?: ReadonlySet<string>;
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
        const rawTile = tileAt(room.tiles, h);
        const trapHidden = rawTile?.kind === 'trap' && !(revealedTraps?.has(k) ?? false);
        const tile = trapHidden ? undefined : rawTile;
        const blocked = tile?.kind === 'blocked';
        const sprungTrap = tile?.kind === 'trap';
        const artifact = tile?.kind === 'artifact';
        const artifactCollected = artifact && (collectedArtifacts?.has(k) ?? false);
        const nonPlaceable = blocked || artifact;
        return (
          <div
            key={k}
            data-room-cell={k}
            data-room-border={border}
            data-room-exit={exit}
            data-room-occupied={occupied}
            data-room-tile={tile?.kind}
            data-room-artifact-collected={artifact ? artifactCollected : undefined}
            onClick={onCellClick ? () => onCellClick(h) : undefined}
            className="absolute flex items-center justify-center text-[10px] font-bold text-white/80"
            style={{
              ...place(h),
              width: 1.733 * size,
              height: 2 * size,
              clipPath: POINTY_TOP,
              cursor: onCellClick ? (nonPlaceable ? 'not-allowed' : 'pointer') : undefined,
              background: blocked
                ? 'rgba(41,37,36,.75)'
                : artifact
                  ? artifactCollected
                    ? 'rgba(161,138,66,.18)'
                    : 'rgba(250,204,21,.32)'
                  : sprungTrap
                    ? 'rgba(244,63,94,.30)'
                    : exit
                      ? 'rgba(74,222,128,.35)'
                      : border
                        ? 'rgba(244,114,182,.28)'
                        : 'rgba(56,189,248,.16)',
              boxShadow: blocked
                ? 'inset 0 0 0 2px rgba(120,113,108,.6)'
                : occupied
                  ? 'inset 0 0 0 3px rgba(250,204,21,.9)'
                  : artifact
                    ? artifactCollected
                      ? 'inset 0 0 0 2px rgba(120,113,108,.5)'
                      : 'inset 0 0 0 2px rgba(250,204,21,.9)'
                    : sprungTrap
                      ? 'inset 0 0 0 2px rgba(244,63,94,.85)'
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
                {tileBadge(tile)}
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
