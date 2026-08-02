import { anchorCell, CONFIG, type Config } from './config';
import { draw, shuffledDeck, type Card } from './deck';
import {
  emptyBoard,
  isLegalPlacement,
  legalCells,
  scorePlacement,
  withCard,
  type Board,
  type PlacementScore,
} from './board';

export type RunStatus = 'playing' | 'won' | 'lost';

export interface LogEntry extends PlacementScore {
  /** 1-based placement number. */
  n: number;
  totalAfter: number;
}

export interface GameState {
  seed: string;
  deck: Card[];
  hand: Card[];
  board: Board;
  score: number;
  placementsLeft: number;
  discardsLeft: number;
  log: LogEntry[];
  status: RunStatus;
}

function settle(state: GameState, cfg: Config): GameState {
  if (state.score >= cfg.targetScore) return { ...state, status: 'won' };
  // The run is over when there is nothing left to do: no placements, no cards,
  // or no legal cell anywhere on the board.
  const stuck =
    state.placementsLeft <= 0 ||
    state.hand.length === 0 ||
    legalCells(state.board, cfg).length === 0;
  return stuck ? { ...state, status: 'lost' } : state;
}

export function newGame(seed: string, cfg: Config = CONFIG): GameState {
  const shuffled = shuffledDeck(seed);

  const { drawn: anchorDraw, deck: afterAnchor } = draw(shuffled, 1);
  const { r, c } = anchorCell(cfg);
  const board = withCard(emptyBoard(cfg), r, c, anchorDraw[0], cfg);

  const { drawn: hand, deck } = draw(afterAnchor, cfg.handSize);

  return settle(
    {
      seed,
      deck,
      hand,
      board,
      score: 0,
      placementsLeft: cfg.placementsPerRun,
      discardsLeft: cfg.discardsPerRun,
      log: [],
      status: 'playing',
    },
    cfg,
  );
}

/**
 * Place hand[handIndex] at (r, c). Returns the state unchanged if the move is
 * not legal, so the UI never has to guard twice.
 */
export function placeCard(
  state: GameState,
  handIndex: number,
  r: number,
  c: number,
  cfg: Config = CONFIG,
): GameState {
  if (state.status !== 'playing') return state;
  if (state.placementsLeft <= 0) return state;

  const card = state.hand[handIndex];
  if (!card) return state;
  if (!isLegalPlacement(state.board, r, c, cfg)) return state;

  const result = scorePlacement(state.board, r, c, card, cfg);
  const board = withCard(state.board, r, c, card, cfg);
  const score = state.score + result.score;

  const remainingHand = state.hand.filter((_, i) => i !== handIndex);
  const { drawn, deck } = draw(state.deck, cfg.handSize - remainingHand.length);

  return settle(
    {
      ...state,
      board,
      score,
      hand: [...remainingHand, ...drawn],
      deck,
      placementsLeft: state.placementsLeft - 1,
      log: [...state.log, { ...result, n: state.log.length + 1, totalAfter: score }],
    },
    cfg,
  );
}

/** Discard 1..maxDiscardSelection cards and refill. Costs a charge, not a placement. */
export function discardCards(
  state: GameState,
  handIndices: readonly number[],
  cfg: Config = CONFIG,
): GameState {
  if (state.status !== 'playing') return state;
  if (state.discardsLeft <= 0) return state;

  const unique = [...new Set(handIndices)].filter((i) => i >= 0 && i < state.hand.length);
  if (unique.length < cfg.minDiscardSelection) return state;
  if (unique.length > cfg.maxDiscardSelection) return state;

  const toss = new Set(unique);
  const remainingHand = state.hand.filter((_, i) => !toss.has(i));
  const { drawn, deck } = draw(state.deck, cfg.handSize - remainingHand.length);

  return settle(
    {
      ...state,
      hand: [...remainingHand, ...drawn],
      deck,
      discardsLeft: state.discardsLeft - 1,
    },
    cfg,
  );
}
