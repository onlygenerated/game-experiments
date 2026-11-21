import { tileValue, type Tile, type Zone } from './rack';

/**
 * One letter tile. A real button, so it is focusable and operable from the
 * keyboard — the arrow keys on a focused tile are the whole no-pointer path.
 */
export function TileFace({
  tile,
  rackId,
  zone,
  selected,
  ghosted,
  onPointerDown,
  onClick,
  onKeyDown,
}: {
  tile: Tile;
  rackId: string;
  zone: Zone;
  selected: boolean;
  /** Being dragged: the real tile stays in place, faded, while the ghost moves. */
  ghosted: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const inTray = zone === 'tray';
  return (
    <button
      type="button"
      data-tile-id={tile.id}
      data-rack-id={rackId}
      aria-label={`${tile.letter}, ${inTray ? 'in tray' : 'on rack'}`}
      aria-pressed={selected}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`tile-face relative grid size-[var(--tile)] shrink-0 place-items-center rounded-[5px] font-bold text-neutral-900 outline-none transition-[transform,opacity] duration-100 ${
        inTray ? 'tile-tray' : ''
      } ${ghosted ? 'opacity-25' : ''} ${selected ? 'tile-selected' : ''} focus-visible:ring-2 focus-visible:ring-sky-400`}
    >
      <span className="text-[calc(var(--tile)*0.5)] leading-none">{tile.letter}</span>
      <span className="absolute right-[3px] bottom-[1px] text-[calc(var(--tile)*0.22)] leading-none font-semibold text-neutral-600">
        {tileValue(tile.letter)}
      </span>
    </button>
  );
}

/** The tile that follows the pointer during a drag. Never a hit-test target —
 *  `pointer-events: none` keeps `elementsFromPoint` seeing the zones under it. */
export function TileGhost({ tile, x, y }: { tile: Tile; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%) scale(1.12) rotate(-3deg)' }}
    >
      <div className="tile-face grid size-[var(--tile)] place-items-center rounded-[5px] font-bold text-neutral-900 shadow-2xl">
        <span className="text-[calc(var(--tile)*0.5)] leading-none">{tile.letter}</span>
      </div>
    </div>
  );
}
