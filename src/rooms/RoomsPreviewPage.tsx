import { useState } from 'react';
import { hexKey, type Hex } from '../hex/coords';
import { RoomBoardView } from './RoomBoardView';
import { roomBorder, roomExits, roomInterior, structureReachesExit } from './room';
import { ROOM_SHAPES } from './shapes';

/**
 * A dev-only view of the two hand-authored room shapes. Rooms has no
 * threshold or run integration yet (items 6-7) — this is proof that
 * "rendering follows the shape" (item 4) and that reach is real geometry,
 * not a placeholder (item 5). Clicking a cell stands in for placing a card
 * there, since there is no card/engine wiring for rooms yet; it is enough
 * to drive `structureReachesExit` and show its answer live.
 */
export function RoomsPreviewPage({ onClose }: { onClose: () => void }) {
  const [structures, setStructures] = useState<Record<string, Set<string>>>({});

  const toggle = (roomName: string, h: Hex) => {
    setStructures((prev) => {
      const current = new Set(prev[roomName] ?? []);
      const k = hexKey(h);
      if (current.has(k)) current.delete(k);
      else current.add(k);
      return { ...prev, [roomName]: current };
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Rooms (dev preview)</h1>
        <span className="text-[11px] text-neutral-500">
          shape and reach only — no threshold or run integration yet. Click cells to stand in for
          placed cards.
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Back to the board
        </button>
      </div>

      <div className="flex flex-wrap gap-8">
        {ROOM_SHAPES.map((room) => {
          const structure = structures[room.name] ?? new Set<string>();
          const reached = structureReachesExit(room, structure);
          return (
            <div key={room.name} data-room-panel={room.name} className="flex flex-col items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-200">{room.name}</h2>
              <p className="text-[11px] text-neutral-500">
                {room.cells.size} cells · {roomBorder(room).length} border ·{' '}
                {roomInterior(room).length} interior · {roomExits(room).length} exits
              </p>
              <RoomBoardView
                room={room}
                structure={structure}
                onCellClick={(h) => toggle(room.name, h)}
              />
              <p
                data-room-reach={reached}
                className={`text-sm font-bold ${reached ? 'text-emerald-400' : 'text-neutral-500'}`}
              >
                {reached ? 'Reached' : 'Not reached'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
