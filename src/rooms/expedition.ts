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
 * a coordinate is legal only if it is inside the current room. Scoring goes
 * through `scoring.ts`'s `scoreRoomPlacement` rather than `scoreHexPlacement`
 * directly as of item 9 — a thin wrapper that applies whatever the room's
 * tile at the placed cell does, without touching the shared scorer itself.
 * Item 11's `'blocked'` tile is the other kind of legality check here: it has
 * no scoring effect at all (nothing in `scoring.ts` reads it), it just makes
 * `isLegalRoomPlacement` reject the cell outright, the same way an already-
 * occupied cell is rejected.
 *
 * Item 12's `'trap'` tile is the first tile kind with state that belongs
 * here rather than on `Room` — see `tile.ts`'s note on why "which traps have
 * sprung" is a per-expedition fact, not part of a room's static shape.
 * `ExpeditionState.revealedTraps` is the set of trap cells (by hex key) that
 * have already fired *this room, this expedition*; it resets to empty on
 * every room transition in `leaveRoom`, the same way the board itself does.
 * `placeInRoom` checks `trapCellsNear` (`room.ts`) for any trap at the
 * placed cell or one of its neighbours that isn't in that set yet, marks it
 * revealed, and pays its cost — one card, taken off the top of the deck if
 * there is one, off the front of the hand otherwise. That ordering matters
 * for the deck accounting: the cost is deducted *before* the normal
 * end-of-turn refill draw, so the refill (if the deck still has cards after
 * the trap's own cost) draws from whatever is left, not from a phantom
 * pre-trap deck.
 *
 * Item 13's `'artifact'` tile follows the same "state belongs here, not on
 * `Room`" split: `ExpeditionState.collectedArtifacts` is the set of artifact
 * cells already joined to the deck *this room, this expedition*, and it
 * resets on every room transition exactly like `revealedTraps`. Unlike a
 * trap, an artifact cell is never a legal placement target (`Room`'s cell
 * already has a card sitting on it — see `isLegalRoomPlacement`), so
 * `placeInRoom` only ever finds one "beside" it, via `artifactCellsNear`.
 * Collecting one costs nothing and adds its card to the *front* of the
 * deck — the same "next to be drawn" position a trap's cost is paid from,
 * so an artifact's own log entry (`cardsGained`) reads as the mirror image
 * of a trap's `cardsLost` rather than an unrelated mechanic. Processed after
 * trap costs and before the end-of-turn refill draw, so a newly collected
 * artifact is exactly as eligible to be drawn into hand this turn as any
 * other deck card would be.
 */
import { CONFIG, type Config } from '../config';
import { draw, shuffledDeck, type Card } from '../deck';
import {
  emptyHexBoard,
  hasHexNeighbor,
  isHexBoardEmpty,
  isHexOccupied,
  withHexCard,
  type HexBoard,
  type HexPlacementScore,
} from '../hex/board';
import { hexKey, type Hex } from '../hex/coords';
import {
  artifactCellsNear,
  isInRoom,
  roomCells,
  roomEndState,
  trapCellsNear,
  type Room,
  type RoomEndState,
} from './room';
import { scoreRoomPlacement } from './scoring';
import { tileAt } from './tile';

export type ExpeditionStatus = 'playing' | 'lost' | 'complete';

export interface ExpeditionLogEntry extends HexPlacementScore {
  /** 1-based placement number within the whole expedition, not just this room. */
  n: number;
  /** The room this placement happened in — a global log spans every room. */
  roomName: string;
  /** Running total (across cleared rooms) plus the current room's score, after this placement. */
  totalAfter: number;
  /** Cards lost to a trap sprung by this placement (item 12) — empty on almost every entry. */
  cardsLost: Card[];
  /** Cards gained from an artifact collected by this placement (item 13) — empty on almost every entry. */
  cardsGained: Card[];
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
  /** Trap cells (item 12) that have already sprung in the current room, by hex key. Resets every room. */
  revealedTraps: ReadonlySet<string>;
  /** Artifact cells (item 13) already joined to the deck in the current room, by hex key. Resets every room. */
  collectedArtifacts: ReadonlySet<string>;
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
  const kind = tileAt(room.tiles, h)?.kind;
  if (kind === 'blocked' || kind === 'artifact') return false;
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
    revealedTraps: new Set(),
    collectedArtifacts: new Set(),
    log: [],
    status: 'playing',
  };
}

/**
 * The one card a sprung trap (item 12) costs: the deck's own top card if it
 * has one — the card that would otherwise have been drawn next — or the
 * front of the hand if the deck is empty. Deterministic rather than a
 * player choice or a random pick: nothing on `ExpeditionState` carries an
 * RNG stream past the opening shuffle, and the item's text asks for a cost,
 * not a decision. Returns `lost: null`, spending nothing, only when both
 * the deck and the hand are already empty.
 */
function payTrapCost(
  hand: readonly Card[],
  deck: readonly Card[],
): { hand: Card[]; deck: Card[]; lost: Card | null } {
  if (deck.length > 0) return { hand: [...hand], deck: deck.slice(1), lost: deck[0] };
  if (hand.length > 0) return { hand: hand.slice(1), deck: [...deck], lost: hand[0] };
  return { hand: [...hand], deck: [...deck], lost: null };
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

  const room = currentRoom(state);
  const result = scoreRoomPlacement(state.board, h, card, room.tiles, cfg);
  const board = withHexCard(state.board, h, card);
  const score = state.score + result.score;

  const remainingHand = state.hand.filter((_, i) => i !== handIndex);

  // Item 12: any trap at this cell or beside it, not already sprung, fires
  // now — revealed, and each one costs a card before the refill draw below.
  const sprungTraps = trapCellsNear(room, h).filter((t) => !state.revealedTraps.has(hexKey(t)));
  const revealedTraps = sprungTraps.length
    ? new Set([...state.revealedTraps, ...sprungTraps.map(hexKey)])
    : state.revealedTraps;

  let hand = remainingHand;
  let deck = state.deck;
  const cardsLost: Card[] = [];
  for (let i = 0; i < sprungTraps.length; i++) {
    const paid = payTrapCost(hand, deck);
    hand = paid.hand;
    deck = paid.deck;
    if (paid.lost) cardsLost.push(paid.lost);
  }

  // Item 13: any artifact at this cell or beside it, not already collected,
  // joins the deck now — added to the front, the same "next to be drawn"
  // position a trap's cost is paid from.
  const newArtifacts = artifactCellsNear(room, h).filter((a) => !state.collectedArtifacts.has(hexKey(a)));
  const collectedArtifacts = newArtifacts.length
    ? new Set([...state.collectedArtifacts, ...newArtifacts.map(hexKey)])
    : state.collectedArtifacts;
  const cardsGained: Card[] = newArtifacts.map((a) => {
    const tile = tileAt(room.tiles, a);
    if (!tile || tile.kind !== 'artifact') throw new Error(`artifactCellsNear returned a non-artifact tile at ${hexKey(a)}`);
    return tile.card;
  });
  if (cardsGained.length) deck = [...cardsGained, ...deck];

  const { drawn, deck: deckAfterDraw } = draw(deck, cfg.handSize - hand.length);

  return settleExpedition(
    {
      ...state,
      board,
      score,
      hand: [...hand, ...drawn],
      deck: deckAfterDraw,
      revealedTraps,
      collectedArtifacts,
      placementsLeft: state.placementsLeft - 1,
      log: [
        ...state.log,
        {
          ...result,
          n: state.log.length + 1,
          roomName: room.name,
          totalAfter: state.runningTotal + score,
          cardsLost,
          cardsGained,
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
      revealedTraps: new Set(),
      collectedArtifacts: new Set(),
    },
    cfg,
  );
}
