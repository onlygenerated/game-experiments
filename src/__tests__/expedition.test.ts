import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { ORIGIN, hexesWithinRadius, type Hex } from '../hex/coords';
import { makeRoom, type Room } from '../rooms/room';
import {
  currentEndState,
  currentRoom,
  isLegalRoomPlacement,
  leaveRoom,
  legalRoomCells,
  newExpedition,
  placeInRoom,
} from '../rooms/expedition';

// A small room, threshold 0, so "cleared" reduces to "reached the exit" and
// every test can drive it deterministically without predicting a lens score.
const SMALL_ROOM: Room = makeRoom('Small', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0);
const SECOND_ROOM: Room = makeRoom('Second', hexesWithinRadius(1), [{ q: -1, r: 0 }], 0);
const EXIT: Hex = { q: 1, r: 0 };

// A blocked cell (item 11) that is not the exit — the room stays clearable
// through the exit; the blocked cell just isn't a legal placement target.
const BLOCKED_CELL: Hex = { q: 0, r: -1 };
const BLOCKED_ROOM: Room = makeRoom('Blocked', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [
  [BLOCKED_CELL, { kind: 'blocked' }],
]);

const cfg = (over: Partial<Config> = {}): Config => ({ ...CONFIG, ...over });

describe('newExpedition', () => {
  it('deals an opening hand into the first room with a full placement budget', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    const state = newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c);
    expect(state.roomIndex).toBe(0);
    expect(currentRoom(state)).toBe(SMALL_ROOM);
    expect(state.hand).toHaveLength(c.handSize);
    expect(state.deck).toHaveLength(52 - c.handSize);
    expect(state.board.size).toBe(0);
    expect(state.score).toBe(0);
    expect(state.runningTotal).toBe(0);
    expect(state.placementsLeft).toBe(5);
    expect(state.status).toBe('playing');
    expect(state.log).toHaveLength(0);
  });
});

describe('isLegalRoomPlacement / legalRoomCells', () => {
  it('rejects a coordinate outside the current room', () => {
    const state = newExpedition('exp-1', [SMALL_ROOM], cfg());
    expect(isLegalRoomPlacement(state, { q: 9, r: 9 }, cfg())).toBe(false);
  });

  it('accepts any of the room cells for the opening (empty-board) placement', () => {
    const state = newExpedition('exp-1', [SMALL_ROOM], cfg());
    expect(legalRoomCells(state, cfg())).toHaveLength(SMALL_ROOM.cells.size);
  });

  it('requires adjacency for placements after the first, once the room is bigger than one ring', () => {
    const bigRoom = makeRoom('Big', hexesWithinRadius(2), [{ q: 2, r: 0 }], 0);
    const c = cfg({ mechanics: { ...CONFIG.mechanics, requireAdjacency: true } });
    let state = newExpedition('exp-1', [bigRoom], c);
    state = placeInRoom(state, 0, { q: -2, r: 0 }, c); // far west
    expect(isLegalRoomPlacement(state, { q: 2, r: 0 }, c)).toBe(false); // far east: not adjacent
    expect(isLegalRoomPlacement(state, { q: -1, r: 0 }, c)).toBe(true); // neighbours the occupied cell
  });

  it('rejects a blocked cell even though it is inside the room and unoccupied', () => {
    const state = newExpedition('exp-1', [BLOCKED_ROOM], cfg());
    expect(isLegalRoomPlacement(state, BLOCKED_CELL, cfg())).toBe(false);
  });

  it('excludes the blocked cell from legalRoomCells but keeps the rest of the room open', () => {
    const state = newExpedition('exp-1', [BLOCKED_ROOM], cfg());
    const legal = legalRoomCells(state, cfg());
    expect(legal.some((h) => h.q === BLOCKED_CELL.q && h.r === BLOCKED_CELL.r)).toBe(false);
    expect(legal).toHaveLength(BLOCKED_ROOM.cells.size - 1);
  });
});

describe('placeInRoom', () => {
  it('scores the placement, spends a placement, and refills the hand', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    const state = newExpedition('exp-1', [SMALL_ROOM], c);
    const before = state.deck.length;
    const next = placeInRoom(state, 0, ORIGIN, c);
    expect(next).not.toBe(state);
    expect(next.board.size).toBe(1);
    expect(next.placementsLeft).toBe(4);
    expect(next.hand).toHaveLength(c.handSize);
    expect(next.deck.length).toBe(before - 1);
    expect(next.log).toHaveLength(1);
    expect(next.log[0]).toMatchObject({ n: 1, roomName: 'Small' });
    expect(next.score).toBe(next.log[0].score);
  });

  it('is a no-op when the target cell is outside the room', () => {
    const state = newExpedition('exp-1', [SMALL_ROOM], cfg());
    const next = placeInRoom(state, 0, { q: 9, r: 9 }, cfg());
    expect(next).toBe(state);
  });

  it('is a no-op when the target cell is already occupied', () => {
    const c = cfg();
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    state = placeInRoom(state, 0, ORIGIN, c);
    const next = placeInRoom(state, 0, ORIGIN, c);
    expect(next).toBe(state);
  });

  it('is a no-op once the expedition is no longer playing', () => {
    const c = cfg({ roomPlacementBudget: 1 });
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    state = placeInRoom(state, 0, { q: -1, r: 0 }, c); // not the exit -> stuck & not cleared -> lost
    expect(state.status).toBe('lost');
    const next = placeInRoom(state, 0, EXIT, c);
    expect(next).toBe(state);
  });

  it('is a no-op when the target cell is blocked, spending no placement and drawing no card', () => {
    const state = newExpedition('exp-1', [BLOCKED_ROOM], cfg());
    const next = placeInRoom(state, 0, BLOCKED_CELL, cfg());
    expect(next).toBe(state);
    expect(next.placementsLeft).toBe(state.placementsLeft);
    expect(next.board.size).toBe(0);
  });
});

describe('room clearing and leaving', () => {
  it('reach and clear track the live board, matching roomEndState', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    expect(currentEndState(state).cleared).toBe(false);
    state = placeInRoom(state, 0, EXIT, c);
    expect(currentEndState(state).reached).toBe(true);
    expect(currentEndState(state).cleared).toBe(true); // threshold 0
  });

  it('leaveRoom is a no-op while the room is not cleared', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c);
    state = placeInRoom(state, 0, { q: -1, r: 0 }, c); // touches border, not the exit
    const next = leaveRoom(state, c);
    expect(next).toBe(state);
    expect(next.roomIndex).toBe(0);
  });

  it('carries deck and hand across a room transition, resets board/score/budget', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c);
    state = placeInRoom(state, 0, EXIT, c);
    const clearedScore = state.score;
    const deckBefore = state.deck;
    const handBefore = state.hand;

    const next = leaveRoom(state, c);
    expect(next.status).toBe('playing');
    expect(next.roomIndex).toBe(1);
    expect(currentRoom(next)).toBe(SECOND_ROOM);
    expect(next.board.size).toBe(0);
    expect(next.score).toBe(0);
    expect(next.runningTotal).toBe(clearedScore);
    expect(next.placementsLeft).toBe(5);
    // "deck intact" — nothing is drawn or reshuffled on a bare leave.
    expect(next.deck).toBe(deckBefore);
    expect(next.hand).toBe(handBefore);
  });

  it('completes the expedition on leaving the last room, with the running total intact', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    state = placeInRoom(state, 0, EXIT, c);
    const clearedScore = state.score;
    const next = leaveRoom(state, c);
    expect(next.status).toBe('complete');
    expect(next.runningTotal).toBe(clearedScore);
  });

  it('accumulates the running total across two cleared rooms', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c);
    state = placeInRoom(state, 0, EXIT, c);
    const firstScore = state.score;
    state = leaveRoom(state, c);
    state = placeInRoom(state, 0, { q: -1, r: 0 }, c); // SECOND_ROOM's exit
    const secondScore = state.score;
    state = leaveRoom(state, c);
    expect(state.status).toBe('complete');
    expect(state.runningTotal).toBe(firstScore + secondScore);
  });
});

describe('failure — running out without clearing', () => {
  it('goes lost when placements run out and the room was never cleared', () => {
    const c = cfg({ roomPlacementBudget: 1 });
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    state = placeInRoom(state, 0, { q: -1, r: 0 }, c); // a border cell, but not the exit
    expect(state.status).toBe('lost');
    expect(currentEndState(state).cleared).toBe(false);
  });

  it('does not go lost when the last placement in the budget clears the room', () => {
    const c = cfg({ roomPlacementBudget: 1 });
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    state = placeInRoom(state, 0, EXIT, c); // budget spent, but this cleared it
    expect(state.status).toBe('playing');
    expect(currentEndState(state).cleared).toBe(true);
    const next = leaveRoom(state, c);
    expect(next.status).toBe('complete');
  });

  it('a lost expedition never comes back to playing', () => {
    const c = cfg({ roomPlacementBudget: 1 });
    let state = newExpedition('exp-1', [SMALL_ROOM], c);
    state = placeInRoom(state, 0, { q: -1, r: 0 }, c);
    expect(state.status).toBe('lost');
    expect(leaveRoom(state, c)).toBe(state);
  });
});
