import { useState } from 'react';
import { hexKey, type Hex } from '../hex/coords';
import { RoomBoardView } from './RoomBoardView';
import { roomBorder, roomEndState, roomExits, roomInterior } from './room';
import { ROOM_SHAPES } from './shapes';

/**
 * A dev-only view of the two hand-authored room shapes. Rooms has no run
 * integration yet (item 7) — this is proof that "rendering follows the
 * shape" (item 4), that reach is real geometry (item 5), and that clearing
 * reads reach and score as two separate conditions rather than one pass/fail
 * (item 6). Clicking a cell stands in for placing a card there, and the
 * score input stands in for a run's running total, since there is no
 * card/engine wiring for rooms yet; it is enough to drive `roomEndState` and
 * show its answer live.
 */
export function RoomsPreviewPage({ onClose }: { onClose: () => void }) {
  const [structures, setStructures] = useState<Record<string, Set<string>>>({});
  const [scores, setScores] = useState<Record<string, number>>({});

  const toggle = (roomName: string, h: Hex) => {
    setStructures((prev) => {
      const current = new Set(prev[roomName] ?? []);
      const k = hexKey(h);
      if (current.has(k)) current.delete(k);
      else current.add(k);
      return { ...prev, [roomName]: current };
    });
  };

  const setScore = (roomName: string, score: number) => {
    setScores((prev) => ({ ...prev, [roomName]: Math.max(0, score) }));
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Rooms (dev preview)</h1>
        <span className="text-[11px] text-neutral-500">
          shape, reach and clearing — no run integration yet (item 7). Click cells to stand in for
          placed cards; the score field stands in for a run's running total.
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
          const score = scores[room.name] ?? 0;
          const end = roomEndState(room, structure, score);
          return (
            <div key={room.name} data-room-panel={room.name} className="flex flex-col items-center gap-2">
              <h2 className="text-sm font-semibold text-neutral-200">{room.name}</h2>
              <p className="text-[11px] text-neutral-500">
                {room.cells.size} cells · {roomBorder(room).length} border ·{' '}
                {roomInterior(room).length} interior · {roomExits(room).length} exits · threshold{' '}
                {room.threshold}
              </p>
              <RoomBoardView
                room={room}
                structure={structure}
                onCellClick={(h) => toggle(room.name, h)}
              />
              <label className="flex items-center gap-2 text-[11px] text-neutral-400">
                stand-in score
                <input
                  type="number"
                  min={0}
                  value={score}
                  onChange={(e) => setScore(room.name, Number(e.target.value))}
                  className="w-20 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-right text-neutral-200"
                />
              </label>
              <div className="flex flex-col items-center gap-0.5">
                <p
                  data-room-reach={end.reached}
                  className={`text-sm font-bold ${end.reached ? 'text-emerald-400' : 'text-neutral-500'}`}
                >
                  {end.reached ? 'Reached' : 'Not reached'}
                </p>
                <p
                  data-room-score-met={end.scoreMet}
                  className={`text-xs ${end.scoreMet ? 'text-emerald-400' : 'text-neutral-500'}`}
                >
                  Score {end.score} / {end.threshold} {end.scoreMet ? '(met)' : '(short)'}
                </p>
                <p
                  data-room-cleared={end.cleared}
                  className={`text-sm font-bold ${end.cleared ? 'text-emerald-300' : 'text-neutral-600'}`}
                >
                  {end.cleared
                    ? 'Cleared'
                    : end.reached
                      ? 'You got there but were short'
                      : end.scoreMet
                        ? 'Score is enough, but you have not reached an exit'
                        : 'Not cleared'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
