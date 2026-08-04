import { useState } from 'react';
import { CardFace } from '../components/CardFace';
import { CONFIG } from '../config';
import { cardLabel } from '../deck';
import { hexKey, type Hex } from '../hex/coords';
import {
  currentEndState,
  currentRoom,
  leaveRoom,
  newExpedition,
  placeInRoom,
  type ExpeditionState,
} from './expedition';
import { RoomBoardView } from './RoomBoardView';
import { roomExits } from './room';
import { ROOM_SHAPES } from './shapes';

const DEFAULT_SEED = 'rooms-1';

/**
 * Item 7: the first real room-to-room run — real cards, a real deck, a
 * running total that survives leaving through an exit. Replaces
 * `RoomsPreviewPage` outright, per that file's own note that it was
 * scaffolding for items 4-6 and not meant to be the permanent home for room
 * shapes. Deliberately its own small page rather than routed through
 * `useRun`/`useCardDrag`: those exist to drive `createEngine`'s
 * target-score run, which `expedition.ts`'s own header explains rooms
 * cannot reuse. A click-to-select-then-click-to-place flow (no drag) keeps
 * this item's scope to the run logic it exists to prove, not a second drag
 * implementation.
 */
export function RoomRunPage({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<ExpeditionState>(() => newExpedition(DEFAULT_SEED, ROOM_SHAPES, CONFIG));
  const [selected, setSelected] = useState<number | null>(null);

  const room = currentRoom(state);
  const end = currentEndState(state);
  const playing = state.status === 'playing';

  function restart() {
    setState(newExpedition(`${DEFAULT_SEED}-${state.roomIndex}-${state.log.length}`, ROOM_SHAPES, CONFIG));
    setSelected(null);
  }

  function place(h: Hex) {
    if (!playing || selected === null) return;
    const next = placeInRoom(state, selected, h, CONFIG);
    if (next === state) return;
    setState(next);
    setSelected(null);
  }

  function leave() {
    const next = leaveRoom(state, CONFIG);
    setState(next);
    setSelected(null);
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Rooms</h1>
        <span data-expedition-status={state.status} className="text-[11px] text-neutral-500">
          Room {state.roomIndex + 1} / {state.rooms.length} — {room.name}
        </span>
        <span className="text-[11px] text-neutral-500">Running total {state.runningTotal}</span>
        <button
          onClick={restart}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          New expedition
        </button>
        <button
          onClick={onClose}
          className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Back to the board
        </button>
      </div>

      {state.status === 'complete' && (
        <p data-room-panel="status" className="mb-3 text-sm font-bold text-emerald-400">
          Expedition complete — final total {state.runningTotal}.
        </p>
      )}
      {state.status === 'lost' && (
        <p data-room-panel="status" className="mb-3 text-sm font-bold text-rose-400">
          Expedition over — ran out of placements without clearing {room.name}. Running total{' '}
          {state.runningTotal}.
        </p>
      )}

      <div className="flex flex-wrap items-start gap-8">
        <RoomBoardView room={room} size={44} board={state.board} onCellClick={place} />

        <div className="flex flex-col gap-1" data-room-panel={room.name}>
          <p className="text-[11px] text-neutral-500">
            {room.cells.size} cells · {roomExits(room).length} exits · threshold {room.threshold} ·
            placements left {state.placementsLeft}
          </p>
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
          <button
            data-room-leave
            disabled={!playing || !end.cleared}
            onClick={leave}
            className={`mt-2 rounded px-3 py-2 text-sm font-semibold shadow-md ${
              playing && end.cleared
                ? 'cursor-pointer bg-gradient-to-b from-emerald-500 to-emerald-700 active:from-emerald-400 active:to-emerald-600'
                : 'cursor-not-allowed bg-neutral-800 text-neutral-500 shadow-none'
            }`}
          >
            Leave through exit
          </button>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {state.hand.map((card, i) => (
          <button
            key={card.id}
            data-hand-index={i}
            disabled={!playing}
            onClick={() => setSelected((prev) => (prev === i ? null : i))}
            className={`rounded transition-transform ${!playing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <CardFace
              card={card}
              size="lg"
              style={{
                outline: selected === i ? '2px solid rgb(52 211 153)' : undefined,
                outlineOffset: selected === i ? '1px' : undefined,
              }}
            />
          </button>
        ))}
        {state.hand.length === 0 && (
          <div className="flex h-24 items-center px-4 text-sm text-neutral-500">Hand empty</div>
        )}
      </div>

      {state.log.length > 0 && (
        <p data-room-last-score className="mt-2 text-center text-[11px] text-neutral-500">
          Last placement: {cardLabel(state.log.at(-1)!.card)} at {hexKey(state.log.at(-1)!.at)} scored{' '}
          {state.log.at(-1)!.score}
        </p>
      )}
    </div>
  );
}
