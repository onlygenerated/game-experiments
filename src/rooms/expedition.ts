/**
 * Item 7: rooms joined into a run. Everything above a single room's board —
 * the deck, the hand, which room you are in, and the running total that
 * survives from one room to the next.
 *
 * This is deliberately not built on `createEngine` (`engine.ts`). That engine's
 * `settle` decides "won" by `state.score >= cfg.targetScore` — a single-run
 * target, which ROOMS.md explicitly voids the moment scoring changes shape
 * ("a room threshold is a different quantity from a run target and cannot be
 * inherited"). A room's win condition is `roomEndState` (reach *and* score,
 * both, always), not a score threshold on its own, so grafting this onto the
 * existing engine would mean fighting its settle logic rather than reusing
 * it. What *does* reuse cleanly is the hex board's placement machinery —
 * `scoreHexPlacement`, `withHexCard`, `hasHexNeighbor` all operate on a bare
 * `HexBoard` map and don't care whether the legal cells around them come from
 * a radius or a room shape, so legality here is the one thing that changes:
 * a coordinate is legal only if it is inside the current room.
 */
import { CONFIG, type Config } from '../config';
import { draw, shuffledDeck, type Card } from '../deck';
import {
  emptyHexBoard,
  hasHexNeighbor,
  isHexBoardEmpty,
  isHexOccupied,
  scoreHexPlacement,
  withHexCard,
  type HexBoard,
  type HexPlacementScore,
} from '../hex/board';
import { type Hex } from '../hex/coords';
import { isInRoom, roomCells, roomEndState, type Room, type RoomEndState } from './room';

export type ExpeditionStatus = 'playing' | 'lost' | 'complete';

export interface ExpeditionLogEntry extends HexPlacementScore {
  /** 1-based placement number within the whole expedition, not just this room. */
  n: number;
  /** The room this placement happened in — a global log spans every room. */
  roomName: string;
  /** Running total (across cleared rooms) plus the current room's score, after this placement. */
  totalAfter: number;
}

export interface ExpeditionState {
  seed: string;
  /** The room sequence, in order. Item 21's room graph replaces the fixed order; not yet. */
  rooms: readonly Room[];
  roomIndex: number;
  board: HexBoard;
  deck: Card[];
  hand: Card[];
  /** This room's score. Resets to 0 on every room transition. */
  score: number;
  /** Sum of every *cleared* room's score. Survives room transitions; never resets. */
  runningTotal: number;
  placementsLeft: number;
  log: ExpeditionLogEntry[];
  status: ExpeditionStatus;
}

export const currentRoom = (state: ExpeditionState): Room => state.rooms[state.roomIndex];

/** The structure a room's reach/score condition is judged against: every occupied cell. */
export const currentStructure = (state: ExpeditionState): ReadonlySet<string> => new Set(state.board.keys());

export const currentEndState = (state: ExpeditionState): RoomEndState =>
  roomEndState(currentRoom(state), currentStructure(state), state.score);

export function isLegalRoomPlacement(state: ExpeditionState, h: Hex, cfg: Config = CONFIG): boolean {
  const room = currentRoom(state);
  if (!isInRoom(room, h)) return false;
  if (isHexOccupied(state.board, h)) return false;
  if (cfg.mechanics.requireAdjacency && !isHexBoardEmpty(state.board) && !hasHexNeighbor(state.board, h)) {
    return false;
  }
  return true;
}

export function legalRoomCells(state: ExpeditionState, cfg: Config = CONFIG): Hex[] {
  return roomCells(currentRoom(state)).filter((h) => isLegalRoomPlacement(state, h, cfg));
}

function settleExpedition(state: ExpeditionState, cfg: Config): ExpeditionState {
  if (state.status !== 'playing') return state;

  // Stuck — no placements, no cards, or nowhere left to play — is only a loss
  // if the room was never cleared. A player who clears a room on their very
  // last placement should still be able to leave, not read as having lost.
  const stuck =
    state.placementsLeft <= 0 || state.hand.length === 0 || legalRoomCells(state, cfg).length === 0;
  if (stuck && !currentEndState(state).cleared) {
    return { ...state, status: 'lost' };
  }
  return state;
}

/** Deal an opening hand and set up the first room. No anchor card — a room's
 * first cell is a real choice among the room's own cells, not a fixed origin
 * the old sprawl radius always contained. */
export function newExpedition(
  seed: string,
  rooms: readonly Room[],
  cfg: Config = CONFIG,
): ExpeditionState {
  const shuffled = shuffledDeck(seed);
  const { drawn: hand, deck } = draw(shuffled, cfg.handSize);

  return {
    seed,
    rooms,
    roomIndex: 0,
    board: emptyHexBoard(),
    deck,
    hand,
    score: 0,
    runningTotal: 0,
    placementsLeft: cfg.roomPlacementBudget,
    log: [],
    status: 'playing',
  };
}

/** Place hand[handIndex] at `h` in the current room. Unchanged if the move isn't legal. */
export function placeInRoom(
  state: ExpeditionState,
  handIndex: number,
  h: Hex,
  cfg: Config = CONFIG,
): ExpeditionState {
  if (state.status !== 'playing') return state;
  if (state.placementsLeft <= 0) return state;

  const card = state.hand[handIndex];
  if (!card) return state;
  if (!isLegalRoomPlacement(state, h, cfg)) return state;

  const result = scoreHexPlacement(state.board, h, card, cfg);
  const board = withHexCard(state.board, h, card);
  const score = state.score + result.score;

  const remainingHand = state.hand.filter((_, i) => i !== handIndex);
  const { drawn, deck } = draw(state.deck, cfg.handSize - remainingHand.length);

  return settleExpedition(
    {
      ...state,
      board,
      score,
      hand: [...remainingHand, ...drawn],
      deck,
      placementsLeft: state.placementsLeft - 1,
      log: [
        ...state.log,
        {
          ...result,
          n: state.log.length + 1,
          roomName: currentRoom(state).name,
          totalAfter: state.runningTotal + score,
        },
      ],
    },
    cfg,
  );
}

/**
 * Leave the current room through its exit. No-op (returns state unchanged)
 * unless the room is actually cleared right now — reach and score are read
 * live off the current board, so a structure that lost reach (impossible
 * with real cards, which are never removed, but kept as a guard rather than
 * assumed) can't be left through.
 *
 * The deck and hand carry over untouched — "deck intact" — and only the
 * board, this room's score, and the placement budget reset. Leaving costs
 * nothing on its own; the placements it took to clear the room were the cost.
 */
export function leaveRoom(state: ExpeditionState, cfg: Config = CONFIG): ExpeditionState {
  if (state.status !== 'playing') return state;
  if (!currentEndState(state).cleared) return state;

  const runningTotal = state.runningTotal + state.score;
  const nextIndex = state.roomIndex + 1;

  if (nextIndex >= state.rooms.length) {
    return { ...state, runningTotal, status: 'complete' };
  }

  return settleExpedition(
    {
      ...state,
      roomIndex: nextIndex,
      board: emptyHexBoard(),
      score: 0,
      runningTotal,
      placementsLeft: cfg.roomPlacementBudget,
    },
    cfg,
  );
}
