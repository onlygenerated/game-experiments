import type { Card } from '../deck';
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
import { createEngine, type EngineState, type Structure } from '../engine';

export type { RunStatus } from '../engine';
export type HexGameState = EngineState<HexBoard, Hex, HexPlacementScore>;
export type HexLogEntry = HexGameState['log'][number];

const structure: Structure<HexBoard, Hex, HexPlacementScore> = {
  empty: emptyHexBoard,
  anchor: () => ORIGIN,
  isLegal: isLegalHexPlacement,
  legalCells: legalHexCells,
  withCard: (board, coord, card: Card) => withHexCard(board, coord, card),
  scorePlacement: scoreHexPlacement,
};

const engine = createEngine(structure);

export const newHexGame = engine.newGame;
export const placeHexCard = engine.placeCard;
export const discardHexCards = engine.discardCards;
