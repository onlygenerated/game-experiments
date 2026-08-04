import { CONFIG, type Config } from '../config';
import type { Card } from '../deck';
import { getScoringLens, type Lens, type LineEval, type ScoredLine, type ScoredPlacement } from '../lens';
import {
  hexAdd,
  hexDistance,
  hexKey,
  hexNeighbors,
  hexScale,
  hexesWithinRadius,
  HEX_AXES,
  HEX_AXIS_NAMES,
  ORIGIN,
  type Hex,
  type HexAxis,
} from './coords';

/** Sparse by design — the point of a sprawl is that it has no fixed extent. */
export type HexBoard = ReadonlyMap<string, Card>;

export const emptyHexBoard = (): HexBoard => new Map();

export function hexAt(board: HexBoard, h: Hex): Card | undefined {
  return board.get(hexKey(h));
}

export const isHexOccupied = (board: HexBoard, h: Hex): boolean => board.has(hexKey(h));

/** Pure: returns a new board with `card` written at `h`. */
export function withHexCard(board: HexBoard, h: Hex, card: Card): HexBoard {
  const next = new Map(board);
  next.set(hexKey(h), card);
  return next;
}

export const hasHexNeighbor = (board: HexBoard, h: Hex): boolean =>
  hexNeighbors(h).some((n) => isHexOccupied(board, n));

export const isHexBoardEmpty = (board: HexBoard): boolean => board.size === 0;

export const inHexBounds = (h: Hex, cfg: Config = CONFIG): boolean =>
  hexDistance(h, ORIGIN) <= cfg.hexRadius;

/**
 * The contiguous run of occupied hexes along `axis` through `h`, ordered from
 * the far end of the negative direction to the far end of the positive one.
 * Returns [] if `h` itself is empty.
 *
 * There is no length cap: a sprawl is supposed to grow. Scoring handles long
 * lines by taking the best window rather than by forbidding them.
 */
export function hexLineCoords(board: HexBoard, h: Hex, axis: HexAxis): Hex[] {
  if (!isHexOccupied(board, h)) return [];
  const dir = HEX_AXES[axis];

  let start = h;
  for (;;) {
    const back = hexAdd(start, hexScale(dir, -1));
    if (!isHexOccupied(board, back)) break;
    start = back;
  }

  const out: Hex[] = [];
  let cur = start;
  while (isHexOccupied(board, cur)) {
    out.push(cur);
    cur = hexAdd(cur, dir);
  }
  return out;
}

export function hexLineCards(board: HexBoard, h: Hex, axis: HexAxis): Card[] {
  return hexLineCoords(board, h, axis).map((p) => hexAt(board, p) as Card);
}

/**
 * Legal if in bounds, empty, and touching something — or if nothing is placed
 * yet, in which case the opening placement picks the origin. No line cap.
 */
export function isLegalHexPlacement(board: HexBoard, h: Hex, cfg: Config = CONFIG): boolean {
  if (!inHexBounds(h, cfg)) return false;
  if (isHexOccupied(board, h)) return false;
  // `axisMode` and `payOnCompleteOnly` are grid-only — three axes and uncapped
  // lines give them nothing to mean here — but free placement transfers.
  if (
    cfg.mechanics.requireAdjacency &&
    !hasHexNeighbor(board, h) &&
    !isHexBoardEmpty(board)
  ) {
    return false;
  }
  return true;
}

export function legalHexCells(board: HexBoard, cfg: Config = CONFIG): Hex[] {
  return hexesWithinRadius(cfg.hexRadius).filter((h) => isLegalHexPlacement(board, h, cfg));
}

export interface HexWindow {
  cards: Card[];
  coords: Hex[];
  result: LineEval;
}

/**
 * Best contiguous window along a line.
 *
 * With no cap a line can outgrow any hand, so instead of scoring all of it we
 * score the strongest stretch — which keeps long lines valuable without letting
 * one line become the whole game, and keeps the read "what is my best five here".
 */
export function bestWindow(cards: Card[], coords: Hex[], lens: Lens, cfg: Config): HexWindow {
  const size = Math.min(cards.length, cfg.hexWindow);
  let best: HexWindow | null = null;

  for (let i = 0; i + size <= cards.length; i++) {
    const slice = cards.slice(i, i + size);
    const result = lens.evaluate(slice, cfg);
    if (!best || result.value > best.result.value) {
      best = { cards: slice, coords: coords.slice(i, i + size), result };
    }
  }

  return best ?? { cards: [], coords: [], result: lens.evaluate([], cfg) };
}

export interface HexLineScore {
  axis: HexAxis;
  name: string;
  /** The whole contiguous run, for highlighting. */
  coords: Hex[];
  /** The stretch that actually scored. */
  window: HexWindow;
}

export interface HexPlacementScore extends ScoredPlacement {
  at: Hex;
  hexLines: HexLineScore[];
  /** Steps from the origin. Feeds the distance bonus. */
  ring: number;
  /** Multiplier applied for building outward. */
  ringBonus: number;
  score: number;
}

/**
 * A placement joins up to three hex lines. Each line is counted on its own by
 * the lens, and the placement scores the sum — no second resource, no product.
 * The ring bonus is the one multiplier left in the core model, and it applies
 * to the total rather than to any one line.
 */
export function scoreHexPlacement(
  board: HexBoard,
  h: Hex,
  card: Card,
  cfg: Config = CONFIG,
  lens: Lens = getScoringLens(cfg),
): HexPlacementScore {
  const next = withHexCard(board, h, card);

  const hexLines: HexLineScore[] = ([0, 1, 2] as HexAxis[]).map((axis) => {
    const coords = hexLineCoords(next, h, axis);
    const cards = coords.map((p) => hexAt(next, p) as Card);
    return {
      axis,
      name: HEX_AXIS_NAMES[axis],
      coords,
      window: bestWindow(cards, coords, lens, cfg),
    };
  });

  const total = hexLines.reduce((sum, l) => sum + l.window.result.value, 0);

  const ring = hexDistance(h, ORIGIN);
  const ringBonus = 1 + ring * cfg.hexRingBonus;

  const lines: ScoredLine[] = hexLines.map((l) => ({
    label: l.name,
    cards: l.coords.map((p) => hexAt(next, p) as Card),
    cellKeys: l.coords.map(hexKey),
    windowKeys: l.window.coords.map(hexKey),
    result: l.window.result,
    value: l.window.result.value,
  }));

  return {
    card,
    at: h,
    hexLines,
    lines,
    notes: ring > 0 ? [{ label: `Ring ${ring} bonus`, points: Math.round(ringBonus * 100) / 100 }] : [],
    ring,
    ringBonus,
    score: Math.round(total * ringBonus),
  };
}
