import { anchorCell, CONFIG, type Config } from './config';
import {
  cashCell,
  emptyBoard,
  isLegalPlacement,
  legalCells,
  scorePlacement,
  withCard,
  type Board,
  type Coord,
  type PlacementScore,
} from './board';
import { createEngine, type EngineState, type Structure } from './engine';

export type { RunStatus } from './engine';
export type GameState = EngineState<Board, Coord, PlacementScore>;
export type LogEntry = GameState['log'][number];

const structure: Structure<Board, Coord, PlacementScore> = {
  empty: emptyBoard,
  anchor: anchorCell,
  isLegal: (board, coord, cfg) => isLegalPlacement(board, coord.r, coord.c, cfg),
  legalCells,
  withCard: (board, coord, card, cfg) => withCard(board, coord.r, coord.c, card, cfg),
  scorePlacement: (board, coord, card, cfg, lens) =>
    scorePlacement(board, coord.r, coord.c, card, cfg, lens),
};

const engine = createEngine(structure);

export const newGame = engine.newGame;

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
  return engine.placeCard(state, handIndex, { r, c }, cfg);
}

export const discardCards = engine.discardCards;

/**
 * Bank the cross through (r, c) and lock both its lines. Costs one action from
 * the same budget as a placement, which is the whole tension of the variant:
 * every cash is a card you did not play.
 *
 * Returns the state unchanged whenever the cash is not available, so the UI and
 * the probe can both call it without guarding first.
 */
export function cashCellAt(
  state: GameState,
  r: number,
  c: number,
  cfg: Config = CONFIG,
): GameState {
  if (state.status !== 'playing') return state;
  if (!cfg.mechanics.lockAndCash) return state;
  if (state.placementsLeft <= 0) return state;

  const cashed = cashCell(state.board, r, c, cfg);
  if (!cashed) return state;

  const score = state.score + cashed.result.score;
  return engine.settle(
    {
      ...state,
      board: cashed.board,
      score,
      placementsLeft: state.placementsLeft - 1,
      log: [...state.log, { ...cashed.result, n: state.log.length + 1, totalAfter: score }],
    },
    cfg,
  );
}
