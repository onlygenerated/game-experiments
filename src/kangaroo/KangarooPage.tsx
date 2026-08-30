import { useCallback, useEffect, useRef, useState } from 'react';
import { RackView, type RackHandlers } from './RackView';
import { TileGhost } from './TileFace';
import {
  clearRack,
  createRoot,
  deleteRack,
  emptyBoard,
  findRack,
  MAX_LETTERS,
  MIN_LETTERS,
  moveTile,
  normalizeWord,
  rackCount,
  restoreTray,
  shuffleRack,
  sortTray,
  spawnChild,
  toggleCollapse,
  toOutline,
  type Rack,
  type Slot,
  type Zone,
} from './rack';
import { clearSaved } from './storage';
import { useBoardHistory } from './useBoardHistory';
import { useTileDrag } from './useTileDrag';

type Selection = { rackId: string; tileId: string } | null;

/** The tree, drawn as indented racks joined by a rail. A subtree, not a
 *  canvas — depth is an indent and siblings stack, so the layout needs no
 *  positions to store and nothing to lay out but flow. */
function RackTree({
  rack,
  isRoot,
  drag,
  selected,
  h,
}: {
  rack: Rack;
  isRoot: boolean;
  drag: ReturnType<typeof useTileDrag>['drag'];
  selected: Selection;
  h: RackHandlers;
}) {
  return (
    <div className="flex flex-col gap-2">
      <RackView rack={rack} isRoot={isRoot} drag={drag} selected={selected} h={h} />
      {!rack.collapsed && rack.children.length > 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-neutral-700 pl-3 min-[900px]:pl-5">
          {rack.children.map((child) => (
            <RackTree key={child.id} rack={child} isRoot={false} drag={drag} selected={selected} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeedForm({ onSeed }: { onSeed: (word: string) => void }) {
  const [text, setText] = useState('');
  const letters = normalizeWord(text);
  const ready = letters.length >= MIN_LETTERS;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSeed(letters);
      }}
      className="panel flex w-full max-w-md flex-col gap-3 rounded-xl p-4"
    >
      <label htmlFor="seed" className="text-sm font-semibold text-neutral-200">
        Start with a word
      </label>
      <input
        id="seed"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="lager"
        maxLength={40}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="panel-inset rounded-lg px-3 py-2 text-lg tracking-[0.2em] uppercase outline-none focus:ring-2 focus:ring-sky-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!ready}
          className="rounded border border-sky-700 bg-sky-950/60 px-3 py-1.5 text-sm font-bold text-sky-200 disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600 min-[900px]:hover:enabled:bg-sky-900"
        >
          Make the rack
        </button>
        <span className="text-[11px] text-neutral-500">
          {letters.length ? `${letters.length} tile${letters.length === 1 ? '' : 's'}` : `${MIN_LETTERS}–${MAX_LETTERS} letters`}
        </span>
      </div>
    </form>
  );
}

/**
 * Kangaroo — a rack of tiles and a pair of scissors, nothing more.
 *
 * A kangaroo word carries a synonym inside it: `lager` carries `ale`. Finding
 * one is a letters-first activity, so this is letters-first furniture. It has
 * no dictionary, does no spell check, and never tells anyone they are wrong —
 * that is a permanent product position, not an MVP cut. See KANGAROO.md.
 */
export function KangarooPage({ onClose }: { onClose?: () => void }) {
  const { board, commit, undo, redo, canUndo, canRedo } = useBoardHistory();
  const [selected, setSelected] = useState<Selection>(null);
  const [copied, setCopied] = useState(false);
  /** A keyboard move rebuilds the tile, so focus has to be put back by id. */
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    document.querySelector<HTMLElement>(`[data-tile-id="${id}"]`)?.focus();
  });

  const move = useCallback(
    (rackId: string, tileId: string, to: Slot) => {
      commit((b) => moveTile(b, rackId, tileId, to));
    },
    [commit],
  );

  const { drag, onPointerDown, consumeDrag } = useTileDrag({
    onDrop: (rackId, tileId, to) => {
      move(rackId, tileId, to);
      setSelected(null);
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const handlers: RackHandlers = {
    onTilePointerDown: (rackId, tile, zone, e) => onPointerDown(rackId, tile, zone, e),

    /** Tap a tile to pick it up; tap a second tile to send the first to that
     *  spot. The whole no-drag path, and the same one a finger uses. */
    onTileClick: (rackId, tileId, zone) => {
      if (consumeDrag()) return;
      if (selected && selected.rackId === rackId && selected.tileId !== tileId) {
        const rack = findRack(board, rackId);
        if (rack) {
          const list = zone === 'rack' ? rack.tiles : rack.tray;
          const index = list.filter((t) => t.id !== selected.tileId).findIndex((t) => t.id === tileId);
          move(rackId, selected.tileId, { rackId, zone, index: Math.max(0, index) });
        }
        setSelected(null);
        return;
      }
      setSelected((prev) => (prev?.tileId === tileId ? null : { rackId, tileId }));
    },

    /** Arrows on a focused tile: shift it along, drop it to the tray, bring it
     *  back. A tile has to be movable with no pointer at all. */
    onTileKeyDown: (rackId, tileId, zone, e) => {
      const rack = findRack(board, rackId);
      if (!rack) return;
      const list = zone === 'rack' ? rack.tiles : rack.tray;
      const i = list.findIndex((t) => t.id === tileId);
      let to: Slot | null = null;
      if (e.key === 'ArrowLeft' && i > 0) to = { rackId, zone, index: i - 1 };
      else if (e.key === 'ArrowRight' && i < list.length - 1) to = { rackId, zone, index: i + 1 };
      else if (e.key === 'ArrowDown' && zone === 'rack')
        to = { rackId, zone: 'tray', index: rack.tray.length };
      else if (e.key === 'ArrowUp' && zone === 'tray')
        to = { rackId, zone: 'rack', index: rack.tiles.length };
      else if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      if (!to) return;
      refocus.current = tileId;
      move(rackId, tileId, to);
    },

    onZoneClick: (rackId: string, zone: Zone) => {
      if (consumeDrag()) return;
      if (!selected || selected.rackId !== rackId) {
        setSelected(null);
        return;
      }
      const rack = findRack(board, rackId);
      if (rack) {
        const list = zone === 'rack' ? rack.tiles : rack.tray;
        const index = list.filter((t) => t.id !== selected.tileId).length;
        move(rackId, selected.tileId, { rackId, zone, index });
      }
      setSelected(null);
    },

    onSpawn: (rackId) => commit((b) => spawnChild(b, rackId)),
    onDelete: (rackId) => {
      setSelected(null);
      commit((b) => deleteRack(b, rackId));
    },
    onCollapse: (rackId) => commit((b) => toggleCollapse(b, rackId)),
    onShuffle: (rackId) => commit((b) => shuffleRack(b, rackId)),
    onSortTray: (rackId) => commit((b) => sortTray(b, rackId)),
    onClear: (rackId) => commit((b) => clearRack(b, rackId)),
    onRestore: (rackId) => commit((b) => restoreTray(b, rackId)),
  };

  const copyOutline = async () => {
    const text = toOutline(board);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      window.prompt('Copy the outline:', text);
    }
  };

  const newTree = () => {
    if (board.root && !window.confirm('Clear the board and start a new word?')) return;
    setSelected(null);
    clearSaved();
    commit(() => emptyBoard());
  };

  const headerButton =
    'shrink-0 rounded border border-neutral-700 px-2.5 py-1 text-xs font-semibold text-neutral-300 disabled:text-neutral-600 active:bg-neutral-800 min-[900px]:hover:enabled:bg-neutral-800';

  return (
    <div className="kangaroo flex min-h-dvh flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="shrink-0 text-base font-bold tracking-tight min-[900px]:text-lg">
          Kangaroo <span className="text-neutral-500">racks</span>
        </h1>
        <span className="hidden text-[11px] text-neutral-500 min-[900px]:inline">
          no dictionary · no spell check · no opinions
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={undo} disabled={!canUndo} className={headerButton}>
            Undo
          </button>
          <button onClick={redo} disabled={!canRedo} className={headerButton}>
            Redo
          </button>
          <button onClick={copyOutline} disabled={!board.root} className={headerButton}>
            {copied ? 'Copied' : 'Copy outline'}
          </button>
          <button onClick={newTree} className={headerButton}>
            New tree
          </button>
          {/* Absent in the standalone build, where there is nothing to go back to. */}
          {onClose && (
            <button onClick={onClose} className={headerButton}>
              Close
            </button>
          )}
        </div>
      </header>

      {board.root ? (
        <>
          <p className="text-[11px] text-neutral-500">
            Drag a letter into the tray to remove it, or back to return it. Tap a tile then tap
            another to swap them; arrow keys move a focused tile. <b className="text-neutral-400">+ child</b> copies
            a rack's letters onto a new rack below it.
          </p>
          <RackTree rack={board.root} isRoot drag={drag} selected={selected} h={handlers} />
          <footer className="mt-auto pt-4 text-[11px] text-neutral-600">
            {rackCount(board)} rack{rackCount(board) === 1 ? '' : 's'} · saved in this browser
          </footer>
        </>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <SeedForm onSeed={(w) => commit(() => createRoot(w))} />
          <div className="panel max-w-md rounded-xl p-4 text-sm text-neutral-400">
            <p className="mb-2 font-semibold text-neutral-200">A kangaroo word carries a synonym.</p>
            <p className="mb-3">
              Type <b className="text-neutral-200">lager</b>, press{' '}
              <b className="text-sky-300">+ child</b>, drag the G and the R into the tray, and
              rearrange what is left into <b className="text-neutral-200">ale</b>.
            </p>
            <p className="text-[11px] text-neutral-500">
              Others to try: masculine, illuminated, feasted, container, encourage.
            </p>
          </div>
        </div>
      )}

      {drag && <TileGhost tile={drag.tile} x={drag.x} y={drag.y} />}
    </div>
  );
}
