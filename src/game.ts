import { anchorCell, CONFIG, type Config } from './config';
import {
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
