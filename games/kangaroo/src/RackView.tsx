import { TileFace } from './TileFace';
import { word, type Rack, type Tile, type Zone } from './rack';
import type { TileDrag } from './useTileDrag';

export type RackHandlers = {
  onTilePointerDown: (rackId: string, tile: Tile, zone: Zone, e: React.PointerEvent) => void;
  onTileClick: (rackId: string, tileId: string, zone: Zone) => void;
  onTileKeyDown: (rackId: string, tileId: string, zone: Zone, e: React.KeyboardEvent) => void;
  onZoneClick: (rackId: string, zone: Zone) => void;
  onSpawn: (rackId: string) => void;
  onDelete: (rackId: string) => void;
  onCollapse: (rackId: string) => void;
  onShuffle: (rackId: string) => void;
  onSortTray: (rackId: string) => void;
  onClear: (rackId: string) => void;
  onRestore: (rackId: string) => void;
};

function Caret() {
  return <div aria-hidden className="h-[var(--tile)] w-[3px] shrink-0 rounded-full bg-sky-400" />;
}

function ToolButton({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`shrink-0 rounded border border-neutral-700 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-neutral-400 active:bg-neutral-800 min-[900px]:hover:bg-neutral-800 ${
        danger ? 'min-[900px]:hover:border-rose-800 min-[900px]:hover:text-rose-300' : ''
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One rack: the tiles, what they spell, and the tray of letters taken off it.
 *
 * The tray is always rendered, even empty, because during a drag it has to be
 * a visible place to aim at. A rack whose letters have all been removed is a
 * legitimate state, not an error — it just spells nothing yet.
 */
export function RackView({
  rack,
  isRoot,
  drag,
  selected,
  h,
}: {
  rack: Rack;
  isRoot: boolean;
  drag: TileDrag | null;
  selected: { rackId: string; tileId: string } | null;
  h: RackHandlers;
}) {
  const dragging = drag && drag.rackId === rack.id ? drag.tile.id : null;
  // The tile leaves its slot only once there is somewhere for it to land, so
  // a drag that wanders off the rack still shows where the letter came from.
  const lifted = dragging !== null && drag?.over != null;
  const caretFor = (zone: Zone): number | null =>
    drag?.over && drag.over.rackId === rack.id && drag.over.zone === zone ? drag.over.index : null;

  const spelled = word(rack);

  // A rack's wells are drawn as wide as the letters it owns, whether they are
  // on it or in its tray, so a rack that has had two letters pulled off keeps
  // two empty slots and the budget you are spending stays visible. The panel
  // around them is a uniform card, wide enough for the toolbar — otherwise a
  // child with more buttons renders wider than the parent it came from, and
  // the tree reads as widening on the way down.
  const slots = rack.tiles.length + rack.tray.length;
  // n tiles + (n-1) 5px gaps + 5px padding either side + the 1px border each
  // side, which counts because everything here is `box-sizing: border-box`.
  const wellWidth = `min(100%, calc(${slots} * var(--tile) + ${slots * 5 + 7}px))`;

  const renderZone = (zone: Zone, tiles: Tile[]) => {
    const shown = lifted ? tiles.filter((t) => t.id !== dragging) : tiles;
    const caret = caretFor(zone);
    return (
      <div
        data-zone={zone}
        data-rack-id={rack.id}
        style={{ width: wellWidth }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-tile-id]')) return;
          h.onZoneClick(rack.id, zone);
        }}
        className={`flex min-h-[calc(var(--tile)+10px)] flex-wrap items-center gap-[5px] rounded-lg p-[5px] ${
          zone === 'rack' ? 'rack-well' : 'tray-well'
        } ${caret !== null ? 'ring-1 ring-sky-500/60' : ''}`}
      >
        {zone === 'tray' && shown.length === 0 && caret === null && (
          <span className="px-2 text-[11px] tracking-wide text-neutral-600 uppercase">
            tray
          </span>
        )}
        {shown.map((tile, i) => (
          <span key={tile.id} className="contents">
            {caret === i && <Caret />}
            <TileFace
              tile={tile}
              rackId={rack.id}
              zone={zone}
              selected={selected?.rackId === rack.id && selected.tileId === tile.id}
              ghosted={!lifted && dragging === tile.id}
              onPointerDown={(e) => h.onTilePointerDown(rack.id, tile, zone, e)}
              onClick={() => h.onTileClick(rack.id, tile.id, zone)}
              onKeyDown={(e) => h.onTileKeyDown(rack.id, tile.id, zone, e)}
            />
          </span>
        ))}
        {caret !== null && caret >= shown.length && <Caret />}
      </div>
    );
  };

  return (
    <div
      className="panel flex max-w-full flex-col items-start rounded-xl p-2"
      style={{ width: `max(20rem, ${wellWidth})` }}
    >
      {renderZone('rack', rack.tiles)}

      <div className="flex w-full items-baseline gap-2 px-1 py-1.5">
        <span
          className={`truncate text-lg font-bold tracking-[0.22em] ${
            spelled ? 'text-neutral-100' : 'text-neutral-600'
          }`}
        >
          {spelled || 'empty'}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-neutral-500">
          {rack.tiles.length}/{rack.tiles.length + rack.tray.length}
        </span>
        {rack.children.length > 0 && (
          <button
            type="button"
            onClick={() => h.onCollapse(rack.id)}
            aria-expanded={!rack.collapsed}
            className="shrink-0 rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 active:bg-neutral-800 min-[900px]:hover:bg-neutral-800"
          >
            {rack.collapsed ? `▸ ${rack.children.length}` : '▾'}
          </button>
        )}
      </div>

      {renderZone('tray', rack.tray)}

      <div className="mt-2 flex w-full flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => h.onSpawn(rack.id)}
          title="Add a child rack with a copy of these letters"
          className="shrink-0 rounded border border-sky-700 bg-sky-950/60 px-2.5 py-1 text-xs font-bold text-sky-200 active:bg-sky-900 min-[900px]:hover:bg-sky-900"
        >
          + child
        </button>
        <ToolButton onClick={() => h.onShuffle(rack.id)} title="Shuffle the rack">
          shuffle
        </ToolButton>
        {rack.tiles.length > 0 && (
          <ToolButton onClick={() => h.onClear(rack.id)} title="Send every letter to the tray">
            clear
          </ToolButton>
        )}
        {rack.tray.length > 0 && (
          <ToolButton onClick={() => h.onRestore(rack.id)} title="Bring the whole tray back">
            restore
          </ToolButton>
        )}
        {rack.tray.length > 1 && (
          <ToolButton onClick={() => h.onSortTray(rack.id)} title="Sort the tray alphabetically">
            a–z
          </ToolButton>
        )}
        {!isRoot && (
          <ToolButton onClick={() => h.onDelete(rack.id)} title="Delete this rack and its children" danger>
            delete
          </ToolButton>
        )}
      </div>
    </div>
  );
}
