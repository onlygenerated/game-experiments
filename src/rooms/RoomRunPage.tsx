import { useState } from 'react';
import { CardFace } from '../components/CardFace';
import { CONFIG } from '../config';
import { cardLabel } from '../deck';
import { hexKey, type Hex } from '../hex/coords';
import {
  addItem,
  currentEndState,
  currentRoom,
  leaveRoom,
  newExpedition,
  placeInRoom,
  visibleTraps,
  type ExpeditionState,
} from './expedition';
import { itemLabel, type Item } from './item';
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

  // Item 15's real acquisition path (a pickup found in a room) is not built
  // yet — nothing in the backlog through item 18 specifies one, and building
  // it here would be doing a later item's design work early for a mechanic
  // this item's own text never asks for. This button is the same kind of
  // stand-in item 4's dev-preview page and item 5/6's click-to-toggle
  // structure were before the real thing existed: it exists so the effect —
  // a carried item changing what a placement scores, via item 2's own
  // counter-combining machinery — is visible and drivable in the running
  // app, not just provable in a test file.
  const SECOND_COUNTER: Item = { kind: 'secondCounter', lensId: 'cribbage' };
  const carryingSecondCounter = state.items.some(
    (it) => it.kind === 'secondCounter' && it.lensId === SECOND_COUNTER.lensId,
  );
  function pickUpSecondCounter() {
    setState((s) => addItem(s, SECOND_COUNTER));
  }

  // Item 16's real acquisition path is unbuilt for the same reason item 15's
  // is — no backlog item through 18 specifies one. Same dev-button stand-in.
  const carryingSight = state.items.some((it) => it.kind === 'sight');
  function pickUpSight() {
    setState((s) => addItem(s, { kind: 'sight' }));
  }

  // Item 17's real acquisition path is unbuilt for the same reason 15/16's
  // are. Unlike those, this item is spent on use — `carryingReachAnchor`
  // reads live off the inventory rather than a separate "already picked up"
  // flag, so the button re-enables the moment the one charge it granted gets
  // consumed by a placement, letting a player pick up another.
  const carryingReachAnchor = state.items.some((it) => it.kind === 'reachAnchor');
  function pickUpReachAnchor() {
    setState((s) => addItem(s, { kind: 'reachAnchor' }));
  }

  // Item 18: a room-duration item, same dev-button stand-in reasoning as
  // 15-17 (no in-room pickup mechanic exists through this item either). It
  // reuses the 'placeholder' kind rather than a fifth real item kind — item
  // 18 is about the temporary/permanent distinction being visible, not a new
  // rule or score effect — so `duration: 'room'` is the only thing setting
  // it apart from `pickUpSecondCounter` et al. `leaveRoom` strips it from
  // `state.items` the moment this room ends; the label's own "(this room
  // only)" tag comes from `itemLabel`, generically, not from this button.
  const TEMP_MARKER: Item = { kind: 'placeholder', label: 'Temporary marker', duration: 'room' };
  const carryingTempMarker = state.items.some(
    (it) => it.kind === 'placeholder' && it.duration === 'room' && it.label === TEMP_MARKER.label,
  );
  function pickUpTempMarker() {
    setState((s) => addItem(s, TEMP_MARKER));
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-3 min-[1280px]:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">Rooms</h1>
        <span data-expedition-status={state.status} className="text-[11px] text-neutral-500">
          Room {state.roomIndex + 1} / {state.rooms.length} — {room.name}
        </span>
        <span className="text-[11px] text-neutral-500">Running total {state.runningTotal}</span>
        <span data-expedition-items className="text-[11px] text-neutral-500">
          Items: {state.items.length ? state.items.map(itemLabel).join(', ') : 'none'}
        </span>
        <button
          data-pickup-second-counter
          onClick={pickUpSecondCounter}
          disabled={!playing || carryingSecondCounter}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 disabled:cursor-not-allowed disabled:opacity-50 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Dev: pick up cribbage counter
        </button>
        <button
          data-pickup-sight
          onClick={pickUpSight}
          disabled={!playing || carryingSight}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 disabled:cursor-not-allowed disabled:opacity-50 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Dev: pick up sight
        </button>
        <button
          data-pickup-reach-anchor
          onClick={pickUpReachAnchor}
          disabled={!playing || carryingReachAnchor}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 disabled:cursor-not-allowed disabled:opacity-50 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Dev: pick up reach anchor
        </button>
        <button
          data-pickup-temp-marker
          onClick={pickUpTempMarker}
          disabled={!playing || carryingTempMarker}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm font-semibold text-neutral-300 disabled:cursor-not-allowed disabled:opacity-50 active:bg-neutral-800 min-[1280px]:hover:bg-neutral-800"
        >
          Dev: pick up temporary marker
        </button>
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
        <RoomBoardView
          room={room}
          size={44}
          board={state.board}
          onCellClick={place}
          revealedTraps={visibleTraps(state)}
          collectedArtifacts={state.collectedArtifacts}
        />

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
          {state.log.at(-1)!.cardsLost.length > 0 && (
            <span data-room-trap-triggered className="text-rose-400">
              {' '}
              — a trap sprang, costing {state.log.at(-1)!.cardsLost.length} card
              {state.log.at(-1)!.cardsLost.length > 1 ? 's' : ''}
            </span>
          )}
          {state.log.at(-1)!.cardsGained.length > 0 && (
            <span data-room-artifact-triggered className="text-amber-300">
              {' '}
              — an artifact joined the deck:{' '}
              {state.log.at(-1)!.cardsGained.map(cardLabel).join(', ')}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
