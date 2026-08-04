import { RoomBoardView } from './RoomBoardView';
import { roomBorder, roomInterior } from './room';
import { ROOM_SHAPES } from './shapes';

/**
 * A dev-only view of the two hand-authored room shapes. Rooms has no exits,
 * threshold or run integration yet (items 5-7) — this is just proof that
 * "rendering follows the shape" instead of assuming a radius-N disc.
 */
export function RoomsPreviewPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Rooms (dev preview)</h1>
        <span className="text-[11px] text-neutral-500">
          shape substrate only — no exits, threshold or scoring yet
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Back to the board
        </button>
      </div>

      <div className="flex flex-wrap gap-8">
        {ROOM_SHAPES.map((room) => (
          <div key={room.name} className="flex flex-col items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-200">{room.name}</h2>
            <p className="text-[11px] text-neutral-500">
              {room.cells.size} cells · {roomBorder(room).length} border ·{' '}
              {roomInterior(room).length} interior
            </p>
            <RoomBoardView room={room} />
          </div>
        ))}
      </div>
    </div>
  );
}
