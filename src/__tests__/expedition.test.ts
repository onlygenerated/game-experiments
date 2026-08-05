import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { ORIGIN, hexKey, hexesWithinRadius, type Hex } from '../hex/coords';
import { makeRoom, type Room } from '../rooms/room';
import { COMBO_BAZAAR_ROOM, CRIBBAGE_VAULT_ROOM } from '../rooms/shapes';
import {
  addItem,
  currentEndState,
  currentRoom,
  isLegalRoomPlacement,
  leaveRoom,
  legalRoomCells,
  newExpedition,
  placeInRoom,
  visibleTraps,
} from '../rooms/expedition';
import type { Item } from '../rooms/item';

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

const ACE_SPADES = { id: 'artifact-AS', rank: 14 as const, suit: 'S' as const };

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

  it('rejects an artifact cell — the card already sitting there is not an empty slot', () => {
    const artifactCell: Hex = { q: 0, r: -1 };
    const room = makeRoom('Artifact', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [
      [artifactCell, { kind: 'artifact', card: ACE_SPADES }],
    ]);
    const state = newExpedition('exp-1', [room], cfg());
    expect(isLegalRoomPlacement(state, artifactCell, cfg())).toBe(false);
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

describe('traps (item 12)', () => {
  const TRAP_CELL: Hex = { q: 0, r: -1 };
  const trapRoom = (name: string, exits: Hex[] = [{ q: 1, r: 0 }]): Room =>
    makeRoom(name, hexesWithinRadius(1), exits, 0, [[TRAP_CELL, { kind: 'trap' }]]);

  it('starts hidden — nothing revealed before any placement', () => {
    const state = newExpedition('exp-1', [trapRoom('Trap')], cfg());
    expect(state.revealedTraps.size).toBe(0);
  });

  it('triggers and reveals when a card lands directly on it, costing exactly one card', () => {
    const state = newExpedition('exp-1', [trapRoom('Trap')], cfg());
    const before = state.deck.length + state.hand.length;
    const next = placeInRoom(state, 0, TRAP_CELL, cfg());
    expect(next.revealedTraps.has(hexKey(TRAP_CELL))).toBe(true);
    expect(next.board.size).toBe(1);
    // One card moved from hand to board (net zero) and one further card was
    // lost outright to the trap — the whole pool (deck+hand+board) shrinks by 1.
    expect(next.deck.length + next.hand.length + next.board.size).toBe(before - 1);
    expect(next.log[0].cardsLost).toHaveLength(1);
  });

  it('triggers when a card lands beside it, not only directly on it', () => {
    const state = newExpedition('exp-1', [trapRoom('Trap')], cfg());
    const next = placeInRoom(state, 0, ORIGIN, cfg()); // (0,0) neighbours the trap at (0,-1)
    expect(next.revealedTraps.has(hexKey(TRAP_CELL))).toBe(true);
    expect(next.log[0].cardsLost).toHaveLength(1);
  });

  it('does not cost a second card once already revealed', () => {
    const state = newExpedition('exp-1', [trapRoom('Trap')], cfg());
    const afterFirst = placeInRoom(state, 0, ORIGIN, cfg()); // triggers via "beside"
    const total = afterFirst.deck.length + afterFirst.hand.length + afterFirst.board.size;
    const afterSecond = placeInRoom(afterFirst, 0, TRAP_CELL, cfg()); // lands on the now-revealed trap
    expect(afterSecond.revealedTraps.size).toBe(1); // still just the one trap cell
    // A normal placement: one card moves hand -> board, nothing further lost.
    expect(afterSecond.deck.length + afterSecond.hand.length + afterSecond.board.size).toBe(total);
    expect(afterSecond.log[1].cardsLost).toHaveLength(0);
  });

  it('a placement nowhere near a trap costs nothing extra', () => {
    const room = makeRoom('NoTrap', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    const state = newExpedition('exp-1', [room], cfg());
    const before = state.deck.length + state.hand.length;
    const next = placeInRoom(state, 0, ORIGIN, cfg());
    expect(next.revealedTraps.size).toBe(0);
    expect(next.deck.length + next.hand.length + next.board.size).toBe(before);
  });

  it('falls back to a hand card once the deck is empty', () => {
    const state = { ...newExpedition('exp-1', [trapRoom('Trap')], cfg()), deck: [] };
    const handBefore = state.hand.length;
    const next = placeInRoom(state, 0, TRAP_CELL, cfg());
    // No cards anywhere to refill from: one placed onto the board, one more
    // taken from hand to pay the trap, and the empty deck can't replace either.
    expect(next.deck.length).toBe(0);
    expect(next.hand.length).toBe(handBefore - 2);
    expect(next.log[0].cardsLost).toHaveLength(1);
  });

  it('resets to hidden on leaving the room — a fresh room does not inherit a sprung trap', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [trapRoom('First', [TRAP_CELL]), trapRoom('Second')], c);
    state = placeInRoom(state, 0, TRAP_CELL, c); // lands on the exit, which is also the trap cell
    expect(state.revealedTraps.size).toBe(1);
    expect(currentEndState(state).cleared).toBe(true); // reached (on the exit) + threshold 0

    const next = leaveRoom(state, c);
    expect(next.roomIndex).toBe(1);
    expect(next.revealedTraps.size).toBe(0);
  });
});

describe('artifacts (item 13)', () => {
  const ARTIFACT_CELL: Hex = { q: 0, r: -1 };
  const artifactRoom = (name: string, exits: Hex[] = [{ q: 1, r: 0 }]): Room =>
    makeRoom(name, hexesWithinRadius(1), exits, 0, [[ARTIFACT_CELL, { kind: 'artifact', card: ACE_SPADES }]]);

  it('starts uncollected — nothing collected before any placement', () => {
    const state = newExpedition('exp-1', [artifactRoom('Artifact')], cfg());
    expect(state.collectedArtifacts.size).toBe(0);
  });

  it('joins the deck when a card lands beside it', () => {
    const state = newExpedition('exp-1', [artifactRoom('Artifact')], cfg());
    const before = state.deck.length + state.hand.length;
    // (0,0) neighbours the artifact at (0,-1) — landing "on" it is illegal
    // (see the legality test above), so "beside" is the only real case.
    const next = placeInRoom(state, 0, ORIGIN, cfg());
    expect(next.collectedArtifacts.has(hexKey(ARTIFACT_CELL))).toBe(true);
    // One card moved from hand to board (net zero) and one further card
    // joined the deck from the artifact — the whole pool grows by exactly 1.
    expect(next.deck.length + next.hand.length + next.board.size).toBe(before + 1);
    expect(next.log[0].cardsGained).toEqual([ACE_SPADES]);
  });

  it('adds the collected card to the front of the deck, next to be drawn', () => {
    const state = newExpedition('exp-1', [artifactRoom('Artifact')], cfg());
    // A second config that targets exactly the post-placement hand size, so
    // placeInRoom draws no refill and the deck's own front stays observable
    // rather than being immediately redrawn into hand.
    const noRefill = cfg({ handSize: state.hand.length - 1 });
    const next = placeInRoom(state, 0, ORIGIN, noRefill);
    expect(next.deck[0]).toEqual(ACE_SPADES);
  });

  it('does not join a second time once already collected', () => {
    const state = newExpedition('exp-1', [artifactRoom('Artifact')], cfg());
    const afterFirst = placeInRoom(state, 0, ORIGIN, cfg()); // triggers via "beside"
    const total = afterFirst.deck.length + afterFirst.hand.length + afterFirst.board.size;
    const afterSecond = placeInRoom(afterFirst, 0, { q: 1, r: -1 }, cfg()); // also beside the artifact
    expect(afterSecond.collectedArtifacts.size).toBe(1); // still just the one artifact cell
    expect(afterSecond.deck.length + afterSecond.hand.length + afterSecond.board.size).toBe(total);
    expect(afterSecond.log[1].cardsGained).toEqual([]);
  });

  it('a placement nowhere near an artifact gains nothing extra', () => {
    const room = makeRoom('NoArtifact', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    const state = newExpedition('exp-1', [room], cfg());
    const before = state.deck.length + state.hand.length;
    const next = placeInRoom(state, 0, ORIGIN, cfg());
    expect(next.collectedArtifacts.size).toBe(0);
    expect(next.deck.length + next.hand.length + next.board.size).toBe(before);
  });

  it('does not cost a placement or a card — collecting is free', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    const state = newExpedition('exp-1', [artifactRoom('Artifact')], c);
    const next = placeInRoom(state, 0, ORIGIN, c);
    expect(next.placementsLeft).toBe(state.placementsLeft - 1); // exactly the one placement spent
    expect(next.log[0].cardsLost).toEqual([]);
  });

  it('resets to uncollected on leaving the room — a fresh room does not inherit a collected artifact', () => {
    // An artifact cell can never itself be an exit (it isn't placeable, and
    // reach requires occupying the exit), so this exit sits one cell over,
    // beside the artifact, and doing so both reaches the exit and collects
    // the artifact in the same placement.
    const EXIT_BESIDE_ARTIFACT: Hex = { q: 1, r: -1 };
    const room = (name: string): Room =>
      makeRoom(name, hexesWithinRadius(1), [EXIT_BESIDE_ARTIFACT], 0, [
        [ARTIFACT_CELL, { kind: 'artifact', card: ACE_SPADES }],
      ]);
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [room('First'), room('Second')], c);
    state = placeInRoom(state, 0, EXIT_BESIDE_ARTIFACT, c);
    expect(state.collectedArtifacts.size).toBe(1);
    expect(currentEndState(state).cleared).toBe(true); // reached (on the exit) + threshold 0

    const next = leaveRoom(state, c);
    expect(next.roomIndex).toBe(1);
    expect(next.collectedArtifacts.size).toBe(0);
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

describe('inventory (item 14)', () => {
  const TEST_ITEM: Item = { kind: 'placeholder', label: 'Test Item' };

  it('starts empty', () => {
    const state = newExpedition('exp-1', [SMALL_ROOM], cfg());
    expect(state.items).toEqual([]);
  });

  it('addItem appends without mutating the original state', () => {
    const state = newExpedition('exp-1', [SMALL_ROOM], cfg());
    const next = addItem(state, TEST_ITEM);
    expect(next).not.toBe(state);
    expect(next.items).toEqual([TEST_ITEM]);
    expect(state.items).toEqual([]);
  });

  it('a placeholder item changes nothing about a placement — same score as with no items', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    const bare = placeInRoom(newExpedition('exp-1', [SMALL_ROOM], c), 0, ORIGIN, c);
    const withItem = placeInRoom(addItem(newExpedition('exp-1', [SMALL_ROOM], c), TEST_ITEM), 0, ORIGIN, c);
    expect(withItem.score).toBe(bare.score);
  });

  it('survives a room transition — unlike revealedTraps/collectedArtifacts, inventory is not per-room', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = addItem(newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c), TEST_ITEM);
    state = placeInRoom(state, 0, EXIT, c);
    const next = leaveRoom(state, c);
    expect(next.roomIndex).toBe(1);
    expect(next.items).toEqual([TEST_ITEM]);
  });
});

describe('temporary vs permanent items (item 18)', () => {
  const ROOM_ONLY: Item = { kind: 'placeholder', label: 'Torch', duration: 'room' };
  const PERMANENT: Item = { kind: 'placeholder', label: 'Map', duration: 'expedition' };
  const DEFAULT_DURATION: Item = { kind: 'placeholder', label: 'Compass' };

  it('a room-duration item is carried and usable up to the moment its room ends', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = addItem(newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c), ROOM_ONLY);
    expect(state.items).toEqual([ROOM_ONLY]);
    state = placeInRoom(state, 0, { q: 0, r: 0 }, c); // not the exit yet — still mid-room
    expect(state.items).toEqual([ROOM_ONLY]);
  });

  it('leaveRoom drops a room-duration item but keeps an expedition-duration one, in the same transition', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c);
    state = addItem(state, ROOM_ONLY);
    state = addItem(state, PERMANENT);
    state = placeInRoom(state, 0, EXIT, c);
    const next = leaveRoom(state, c);
    expect(next.roomIndex).toBe(1);
    expect(next.items).toEqual([PERMANENT]);
  });

  it('an item with no duration field survives a room transition exactly like an explicit expedition duration', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = addItem(newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c), DEFAULT_DURATION);
    state = placeInRoom(state, 0, EXIT, c);
    const next = leaveRoom(state, c);
    expect(next.items).toEqual([DEFAULT_DURATION]);
  });

  it('a room-duration item is also dropped on the transition that completes the expedition', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = addItem(newExpedition('exp-1', [SMALL_ROOM], c), ROOM_ONLY);
    state = placeInRoom(state, 0, EXIT, c);
    const next = leaveRoom(state, c);
    expect(next.status).toBe('complete');
    expect(next.items).toEqual([]);
  });

  it('leaveRoom does not mutate the pre-leave state\'s item array', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    let state = newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c);
    state = addItem(state, ROOM_ONLY);
    state = placeInRoom(state, 0, EXIT, c);
    const before = state.items;
    leaveRoom(state, c);
    expect(before).toEqual([ROOM_ONLY]);
  });
});

describe('second counter item (item 15)', () => {
  // Cribbage alone as the room's counter, so a carried poker second-counter
  // item is the one thing separating the two runs below.
  const c = cfg({ roomPlacementBudget: 5, lensId: 'cribbage', secondLensId: '' });
  const SECOND_COUNTER: Item = { kind: 'secondCounter', lensId: 'poker' };

  it("a carried item's counter scores strictly more than the bare primary lens, via item 2's own combining machinery", () => {
    // Same seed and room on both sides, so hand[0] is the identical card in
    // both runs — the only difference is whether the item is carried.
    const bare = placeInRoom(newExpedition('exp-1', [SMALL_ROOM], c), 0, ORIGIN, c);
    const withItem = placeInRoom(addItem(newExpedition('exp-1', [SMALL_ROOM], c), SECOND_COUNTER), 0, ORIGIN, c);

    expect(withItem.score).toBeGreaterThan(bare.score);
    expect(withItem.log[0].card).toEqual(bare.log[0].card);
  });

  it('does nothing once the room is already scoring under that lens as the primary counter', () => {
    const primaryPoker = cfg({ roomPlacementBudget: 5, lensId: 'poker', secondLensId: '' });
    const bare = placeInRoom(newExpedition('exp-1', [SMALL_ROOM], primaryPoker), 0, ORIGIN, primaryPoker);
    const withItem = placeInRoom(
      addItem(newExpedition('exp-1', [SMALL_ROOM], primaryPoker), { kind: 'secondCounter', lensId: 'poker' }),
      0,
      ORIGIN,
      primaryPoker,
    );
    expect(withItem.score).toBe(bare.score);
  });

  it('persists across a room transition — the boost still applies in the next room', () => {
    // SMALL_ROOM's threshold is 0, so reaching the exit clears it regardless
    // of the item, letting both runs reach an identical, deck-and-hand-intact
    // start of SECOND_ROOM to compare.
    const bare = leaveRoom(placeInRoom(newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c), 0, EXIT, c), c);
    const withItem = leaveRoom(
      placeInRoom(addItem(newExpedition('exp-1', [SMALL_ROOM, SECOND_ROOM], c), SECOND_COUNTER), 0, EXIT, c),
      c,
    );
    expect(bare.roomIndex).toBe(1);
    expect(withItem.roomIndex).toBe(1);
    expect(withItem.hand).toEqual(bare.hand);

    const bareNext = placeInRoom(bare, 0, ORIGIN, c);
    const withItemNext = placeInRoom(withItem, 0, ORIGIN, c);
    expect(withItemNext.score).toBeGreaterThan(bareNext.score);
  });
});

describe('reach anchor item (item 17)', () => {
  // A radius-2 room, same as the "requires adjacency" legality test above,
  // so there is enough space for a cell that is neither adjacent to the
  // origin nor an accident of the room being too small to prove anything.
  const bigRoom = () => makeRoom('Big', hexesWithinRadius(2), [{ q: 2, r: 0 }], 0);
  const c = cfg({ roomPlacementBudget: 6, mechanics: { ...CONFIG.mechanics, requireAdjacency: true } });
  const REACH_ANCHOR: Item = { kind: 'reachAnchor' };

  // (2,-1) is distance 2 from the origin — not a neighbour of it, and not a
  // neighbour of anything placed at the origin — so it is a genuinely
  // unconnected cell once the origin is occupied.
  const FAR_CELL: Hex = { q: 2, r: -1 };
  // (2,-2) is a real hex neighbour of FAR_CELL but distance 2 from the
  // origin — legal only via adjacency to whatever gets placed at FAR_CELL,
  // never via the origin's own structure.
  const NEXT_TO_FAR_CELL: Hex = { q: 2, r: -2 };

  it('rejects an unconnected cell once the board is non-empty and no reach anchor is carried', () => {
    let state = newExpedition('exp-1', [bigRoom()], c);
    state = placeInRoom(state, 0, ORIGIN, c);
    expect(isLegalRoomPlacement(state, FAR_CELL, c)).toBe(false);
  });

  it('accepts the same unconnected cell once a reach-anchor charge is carried', () => {
    let state = addItem(newExpedition('exp-1', [bigRoom()], c), REACH_ANCHOR);
    state = placeInRoom(state, 0, ORIGIN, c);
    expect(isLegalRoomPlacement(state, FAR_CELL, c)).toBe(true);
  });

  it('placeInRoom spends the charge on the placement that actually needed it', () => {
    let state = addItem(newExpedition('exp-1', [bigRoom()], c), REACH_ANCHOR);
    state = placeInRoom(state, 0, ORIGIN, c);
    expect(state.items).toEqual([REACH_ANCHOR]); // the opening placement needed nothing

    const next = placeInRoom(state, 0, FAR_CELL, c);
    expect(next.board.size).toBe(2);
    expect(next.items).toEqual([]); // spent
  });

  it('does not spend a carried charge on a placement that is already legal on its own', () => {
    let state = addItem(newExpedition('exp-1', [bigRoom()], c), REACH_ANCHOR);
    state = placeInRoom(state, 0, ORIGIN, c); // opening placement — always legal, empty board
    expect(state.items).toEqual([REACH_ANCHOR]);

    const next = placeInRoom(state, 0, { q: -1, r: 0 }, c); // neighbours the origin directly
    expect(next.board.size).toBe(2);
    expect(next.items).toEqual([REACH_ANCHOR]); // untouched — this move never needed it
  });

  it('a placement dropped via a reach anchor becomes a real second origin — later placements can grow from it without spending another charge', () => {
    let state = addItem(newExpedition('exp-1', [bigRoom()], c), REACH_ANCHOR);
    state = placeInRoom(state, 0, ORIGIN, c);
    state = placeInRoom(state, 0, FAR_CELL, c); // spends the one charge
    expect(state.items).toEqual([]);

    // NEXT_TO_FAR_CELL is not adjacent to the origin — only to FAR_CELL —
    // and no reach anchor is carried anymore, yet it must still be legal.
    expect(isLegalRoomPlacement(state, NEXT_TO_FAR_CELL, c)).toBe(true);
    const next = placeInRoom(state, 0, NEXT_TO_FAR_CELL, c);
    expect(next.board.size).toBe(3);
    expect(next.items).toEqual([]); // still nothing to spend, and nothing was needed
  });

  it('does not apply to the opening placement — an empty board never needs the adjacency exception', () => {
    const state = addItem(newExpedition('exp-1', [bigRoom()], c), REACH_ANCHOR);
    const next = placeInRoom(state, 0, FAR_CELL, c); // legal anyway: board starts empty
    expect(next.items).toEqual([REACH_ANCHOR]); // untouched
  });

  it('without an item, placeInRoom is a no-op on an unconnected cell', () => {
    let state = newExpedition('exp-1', [bigRoom()], c);
    state = placeInRoom(state, 0, ORIGIN, c);
    const next = placeInRoom(state, 0, FAR_CELL, c);
    expect(next).toBe(state);
  });
});

describe('visibleTraps / sight item (item 16)', () => {
  const TRAP_CELL: Hex = { q: 0, r: -1 };
  const trapRoom = (name: string, exits: Hex[] = [{ q: 1, r: 0 }]): Room =>
    makeRoom(name, hexesWithinRadius(1), exits, 0, [[TRAP_CELL, { kind: 'trap' }]]);
  const SIGHT: Item = { kind: 'sight' };

  it('without sight, shows only sprung traps — same set as revealedTraps itself', () => {
    const state = newExpedition('exp-1', [trapRoom('Trap')], cfg());
    expect(visibleTraps(state)).toBe(state.revealedTraps);
  });

  it('with sight, reveals a trap before anything has sprung it', () => {
    const state = addItem(newExpedition('exp-1', [trapRoom('Trap')], cfg()), SIGHT);
    expect(state.revealedTraps.size).toBe(0); // nothing has actually triggered yet
    expect(visibleTraps(state).has(hexKey(TRAP_CELL))).toBe(true);
  });

  it('revealing a trap with sight does not exempt it from its cost once triggered', () => {
    const c = cfg({ roomPlacementBudget: 5 });
    const state = addItem(newExpedition('exp-1', [trapRoom('Trap')], c), SIGHT);
    const before = state.deck.length + state.hand.length;
    const next = placeInRoom(state, 0, ORIGIN, c); // beside the trap
    expect(next.revealedTraps.has(hexKey(TRAP_CELL))).toBe(true); // now genuinely sprung too
    expect(next.log[0].cardsLost).toHaveLength(1); // sight never waived the cost
    expect(next.deck.length + next.hand.length + next.board.size).toBe(before - 1);
  });

  it('once actually sprung, the trap stays visible even without sight', () => {
    const state = newExpedition('exp-1', [trapRoom('Trap')], cfg());
    const next = placeInRoom(state, 0, ORIGIN, cfg()); // triggers it "beside", no sight carried
    expect(visibleTraps(next).has(hexKey(TRAP_CELL))).toBe(true);
  });

  it('a room with no traps reveals nothing even with sight carried', () => {
    const room = makeRoom('NoTrap', hexesWithinRadius(1), [{ q: 1, r: 0 }]);
    const state = addItem(newExpedition('exp-1', [room], cfg()), SIGHT);
    expect(visibleTraps(state).size).toBe(0);
  });
});

describe('room counters (item 19)', () => {
  // The run's own cfg says poker — every test below is only interesting if a
  // room's own counters actually win out over this.
  const runCfg = cfg({ roomPlacementBudget: 5, lensId: 'poker', secondLensId: '' });

  const CRIBBAGE_ROOM: Room = makeRoom('CribbageRoom', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [], {
    lensId: 'cribbage',
    secondLensId: '',
  });
  const POKER_ROOM: Room = makeRoom('PokerRoom', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [], {
    lensId: 'poker',
    secondLensId: '',
  });
  const COMBO_ROOM: Room = makeRoom('ComboRoom', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0, [], {
    lensId: 'cribbage',
    secondLensId: 'poker',
  });
  const PLAIN_ROOM: Room = makeRoom('PlainRoom', hexesWithinRadius(1), [{ q: 1, r: 0 }], 0);

  it("a room's own counters override the run's Config for scoring", () => {
    // Same seed, same room shape — the only difference is CRIBBAGE_ROOM
    // fixing lensId to cribbage regardless of runCfg's own 'poker'.
    const underRoom = placeInRoom(newExpedition('exp-1', [CRIBBAGE_ROOM], runCfg), 0, ORIGIN, runCfg);
    const underRunCfg = placeInRoom(newExpedition('exp-1', [PLAIN_ROOM], runCfg), 0, ORIGIN, runCfg);
    const explicitCribbage = placeInRoom(
      newExpedition('exp-1', [PLAIN_ROOM], cfg({ ...runCfg, lensId: 'cribbage' })),
      0,
      ORIGIN,
      cfg({ ...runCfg, lensId: 'cribbage' }),
    );
    expect(underRoom.score).toBe(explicitCribbage.score);
    expect(underRoom.log[0].card).toEqual(underRunCfg.log[0].card); // same seed, same draw
  });

  it('a room with no counters override is a pure passthrough of the run cfg', () => {
    const viaPlainRoom = placeInRoom(newExpedition('exp-1', [PLAIN_ROOM], runCfg), 0, ORIGIN, runCfg);
    const viaExplicitPokerRoom = placeInRoom(newExpedition('exp-1', [POKER_ROOM], runCfg), 0, ORIGIN, runCfg);
    expect(viaPlainRoom.score).toBe(viaExplicitPokerRoom.score);
  });

  it("a room's combo counters score strictly more than either counter alone, same as item 15's carried second counter", () => {
    const single = placeInRoom(newExpedition('exp-1', [CRIBBAGE_ROOM], runCfg), 0, ORIGIN, runCfg);
    const combo = placeInRoom(newExpedition('exp-1', [COMBO_ROOM], runCfg), 0, ORIGIN, runCfg);
    expect(combo.log[0].card).toEqual(single.log[0].card); // identical seed and draw
    expect(combo.score).toBeGreaterThan(single.score);
  });

  it("a carried second-counter item still layers on top of the room's own baseline counter", () => {
    const bare = placeInRoom(newExpedition('exp-1', [CRIBBAGE_ROOM], runCfg), 0, ORIGIN, runCfg);
    const withItem = placeInRoom(
      addItem(newExpedition('exp-1', [CRIBBAGE_ROOM], runCfg), { kind: 'secondCounter', lensId: 'poker' }),
      0,
      ORIGIN,
      runCfg,
    );
    expect(withItem.score).toBeGreaterThan(bare.score);
  });

  it("CRIBBAGE_VAULT_ROOM scores its opening placement under cribbage, matching an explicit-cribbage cfg", () => {
    const viaArchetype = placeInRoom(newExpedition('exp-1', [CRIBBAGE_VAULT_ROOM], runCfg), 0, ORIGIN, runCfg);
    const cribbageCfg = { ...runCfg, lensId: 'cribbage', secondLensId: '' };
    const viaExplicitCfg = placeInRoom(newExpedition('exp-1', [PLAIN_ROOM], cribbageCfg), 0, ORIGIN, cribbageCfg);
    expect(viaArchetype.score).toBe(viaExplicitCfg.score);
  });

  it('COMBO_BAZAAR_ROOM scores an untiled cell strictly more than cribbage alone — its combo counters at work', () => {
    // (2,-1) carries no bonus tile (see shapes.ts), so this isolates the
    // counter difference from any tile effect.
    const UNTILED_CELL: Hex = { q: 2, r: -1 };
    const cribbageOnlyBig = makeRoom(
      'CribbageOnlyBig',
      hexesWithinRadius(2),
      [{ q: 2, r: 0 }, { q: -2, r: 0 }],
      0,
      [],
      { lensId: 'cribbage', secondLensId: '' },
    );
    const single = placeInRoom(newExpedition('exp-1', [cribbageOnlyBig], runCfg), 0, UNTILED_CELL, runCfg);
    const combo = placeInRoom(newExpedition('exp-1', [COMBO_BAZAAR_ROOM], runCfg), 0, UNTILED_CELL, runCfg);
    expect(combo.log[0].card).toEqual(single.log[0].card); // identical seed and draw
    expect(combo.score).toBeGreaterThan(single.score);
  });
});
