import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { ORIGIN, hexKey, hexesWithinRadius, type Hex } from '../hex/coords';
import { makeRoom, type Room } from '../rooms/room';
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
