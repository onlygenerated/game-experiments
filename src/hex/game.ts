import { CONFIG, type Config } from '../config';
import { draw, shuffledDeck, type Card } from '../deck';
import {
  emptyHexBoard,
  isLegalHexPlacement,
  legalHexCells,
  scoreHexPlacement,
  withHexCard,
  type HexBoard,
  type HexPlacementScore,
} from './board';
import { ORIGIN, type Hex } from './coords';

/**
 * Run state for hex structures.
 *
 * This deliberately mirrors `src/game.ts` rather than sharing with it. The two
 * differ only in the six board calls, so a `Structure` abstraction would remove
 * the duplication — but that refactor touches the module every existing ruleset
 * depends on, and a half-finished version of it would be a far worse outcome
 * than two small parallel files. Unifying them is queued, not forgotten.
 */
export type RunStatus = 'playing' | 'won' | 'lost';

export interface HexLogEntry extends HexPlacementScore {
  n: number;
  totalAfter: number;
}

export interface HexGameState {
  seed: string;
  deck: Card[];
  hand: Card[];
  board: HexBoard;
  score: number;
  placementsLeft: number;
  discardsLeft: number;
  log: HexLogEntry[];
  status: RunStatus;
}

function settle(state: HexGameState, cfg: Config): HexGameState {
  if (state.score >= cfg.targetScore) return { ...state, status: 'won' };
  const stuck =
    state.placementsLeft <= 0 ||
    state.hand.length === 0 ||
    legalHexCells(state.board, cfg).length === 0;
  return stuck ? { ...state, status: 'lost' } : state;
}

export function newHexGame(seed: string, cfg: Config = CONFIG): HexGameState {
  const shuffled = shuffledDeck(seed);

  let board = emptyHexBoard();
  let remaining = shuffled;
  if (cfg.startWithAnchor) {
    const { drawn, deck: afterAnchor } = draw(shuffled, 1);
    board = withHexCard(board, ORIGIN, drawn[0]);
    remaining = afterAnchor;
  }

  const { drawn: hand, deck } = draw(remaining, cfg.handSize);

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

/** Returns the state unchanged on an illegal move, so the UI never guards twice. */
export function placeHexCard(
  state: HexGameState,
  handIndex: number,
  at: Hex,
  cfg: Config = CONFIG,
): HexGameState {
  if (state.status !== 'playing') return state;
  if (state.placementsLeft <= 0) return state;

  const card = state.hand[handIndex];
  if (!card) return state;
  if (!isLegalHexPlacement(state.board, at, cfg)) return state;

  const result = scoreHexPlacement(state.board, at, card, cfg);
  const board = withHexCard(state.board, at, card);
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

export function discardHexCards(
  state: HexGameState,
  handIndices: readonly number[],
  cfg: Config = CONFIG,
): HexGameState {
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
