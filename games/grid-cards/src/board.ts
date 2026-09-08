import { CONFIG, type Config } from './config';
import type { Card } from './deck';
import {
  getScoringLens,
  type Lens,
  type LineEval,
  type ScoredLine,
  type ScoredPlacement,
  type ScoreItem,
} from './lens';

/**
 * A card sitting on the board, which unlike a card in hand belongs to lines and
 * so can have those lines locked. The flags live here rather than on `Card`
 * because a card in hand has no lines for the idea to mean anything.
 */
export interface PlacedCard extends Card {
  /** Its row run has been cashed and can never be extended again. */
  lockedRow?: boolean;
  lockedCol?: boolean;
}

export type Cell = PlacedCard | null;
/** Row-major, length gridSize * gridSize. */
export type Board = readonly Cell[];

export type Axis = 'row' | 'col';

export interface Coord {
  r: number;
  c: number;
}

export function emptyBoard(cfg: Config = CONFIG): Board {
  return new Array<Cell>(cfg.gridSize * cfg.gridSize).fill(null);
}

export function idx(r: number, c: number, cfg: Config = CONFIG): number {
  return r * cfg.gridSize + c;
}

export function inBounds(r: number, c: number, cfg: Config = CONFIG): boolean {
  return r >= 0 && c >= 0 && r < cfg.gridSize && c < cfg.gridSize;
}

export function cellAt(board: Board, r: number, c: number, cfg: Config = CONFIG): Cell {
  if (!inBounds(r, c, cfg)) return null;
  return board[idx(r, c, cfg)];
}

/** Pure: returns a new board with `card` written to (r, c). */
export function withCard(
  board: Board,
  r: number,
  c: number,
  card: Card,
  cfg: Config = CONFIG,
): Board {
  const next = board.slice();
  next[idx(r, c, cfg)] = card;
  return next;
}

export function isOccupied(board: Board, r: number, c: number, cfg: Config = CONFIG): boolean {
  return cellAt(board, r, c, cfg) !== null;
}

export function isBoardEmpty(board: Board): boolean {
  return board.every((cell) => cell === null);
}

export function hasOccupiedNeighbor(
  board: Board,
  r: number,
  c: number,
  cfg: Config = CONFIG,
): boolean {
  return (
    isOccupied(board, r - 1, c, cfg) ||
    isOccupied(board, r + 1, c, cfg) ||
    isOccupied(board, r, c - 1, cfg) ||
    isOccupied(board, r, c + 1, cfg)
  );
}

/**
 * The contiguous run of occupied cells along `axis` that contains (r, c).
 * Returns [] if (r, c) is itself empty. Ordered left-to-right / top-to-bottom.
 */
export function lineCoords(
  board: Board,
  r: number,
  c: number,
  axis: Axis,
  cfg: Config = CONFIG,
): Coord[] {
  if (!isOccupied(board, r, c, cfg)) return [];

  const dr = axis === 'col' ? 1 : 0;
  const dc = axis === 'row' ? 1 : 0;

  let sr = r;
  let sc = c;
  while (isOccupied(board, sr - dr, sc - dc, cfg)) {
    sr -= dr;
    sc -= dc;
  }

  const out: Coord[] = [];
  let er = sr;
  let ec = sc;
  while (isOccupied(board, er, ec, cfg)) {
    out.push({ r: er, c: ec });
    er += dr;
    ec += dc;
  }
  return out;
}

export function lineCards(
  board: Board,
  r: number,
  c: number,
  axis: Axis,
  cfg: Config = CONFIG,
): Card[] {
  return lineCoords(board, r, c, axis, cfg).map((p) => board[idx(p.r, p.c, cfg)] as Card);
}

/**
 * Run length through (r, c) along `axis` *as if* a card were placed there.
 * Used by the legality check, which runs before the card exists on the board.
 */
export function projectedRunLength(
  board: Board,
  r: number,
  c: number,
  axis: Axis,
  cfg: Config = CONFIG,
): number {
  const dr = axis === 'col' ? 1 : 0;
  const dc = axis === 'row' ? 1 : 0;

  let len = 1;
  for (let k = 1; isOccupied(board, r - dr * k, c - dc * k, cfg); k++) len++;
  for (let k = 1; isOccupied(board, r + dr * k, c + dc * k, cfg); k++) len++;
  return len;
}

/**
 * The whole rule set: empty, orthogonally touching something, and neither
 * resulting run exceeds the cap. No suit or rank matching. Scoring does the
 * discriminating.
 *
 * With `requireAdjacency` off the touching clause is dropped and the board is
 * open, which is the free-placement variant.
 */
export function isLegalPlacement(
  board: Board,
  r: number,
  c: number,
  cfg: Config = CONFIG,
): boolean {
  if (!inBounds(r, c, cfg)) return false;
  if (isOccupied(board, r, c, cfg)) return false;
  // Adjacency is unsatisfiable on an empty board, so the opening placement is
  // free to go anywhere. With an anchor this branch is unreachable.
  if (
    cfg.mechanics.requireAdjacency &&
    !hasOccupiedNeighbor(board, r, c, cfg) &&
    !isBoardEmpty(board)
  ) {
    return false;
  }
  if (projectedRunLength(board, r, c, 'row', cfg) > cfg.lineCap) return false;
  if (projectedRunLength(board, r, c, 'col', cfg) > cfg.lineCap) return false;
  if (extendsLockedRun(board, r, c, 'row', cfg)) return false;
  if (extendsLockedRun(board, r, c, 'col', cfg)) return false;
  return true;
}

/**
 * Would a card here join a run that has already been cashed? Runs are
 * contiguous, so only the two immediate neighbours along the axis can be part
 * of one. A no-op until something is actually locked.
 */
export function extendsLockedRun(
  board: Board,
  r: number,
  c: number,
  axis: Axis,
  cfg: Config = CONFIG,
): boolean {
  const dr = axis === 'col' ? 1 : 0;
  const dc = axis === 'row' ? 1 : 0;
  const flag = axis === 'row' ? 'lockedRow' : 'lockedCol';
  return Boolean(
    cellAt(board, r - dr, c - dc, cfg)?.[flag] || cellAt(board, r + dr, c + dc, cfg)?.[flag],
  );
}

/**
 * A cross can be cashed once, while neither of its lines is locked, and only
 * if it is actually a line.
 *
 * That last clause is not fussiness. Sealing a lone card locks a one-cell run
 * on *both* axes, which walls off all four of its neighbours; on an anchored
 * board, cashing the opening card for a couple of points therefore ends the run
 * immediately. A value-maximising agent walks straight into it.
 */
export function canCash(board: Board, r: number, c: number, cfg: Config = CONFIG): boolean {
  const cell = cellAt(board, r, c, cfg);
  if (!cell || cell.lockedRow || cell.lockedCol) return false;
  // The centre cell is counted by both lines, so 3 here means 2 distinct cards.
  const span =
    lineCoords(board, r, c, 'row', cfg).length + lineCoords(board, r, c, 'col', cfg).length;
  return span >= 3;
}

/**
 * Bank the cross through (r, c) and lock both its runs, so neither can ever be
 * extended or cashed again. Returns null when there is nothing to cash, so the
 * caller never has to guard twice.
 */
export function cashCell(
  board: Board,
  r: number,
  c: number,
  cfg: Config = CONFIG,
  lens: Lens = getScoringLens(cfg),
): { board: Board; result: PlacementScore } | null {
  if (!canCash(board, r, c, cfg)) return null;

  const result = scoreCross(board, r, c, cfg, lens, 'cash');
  const next = board.slice();
  for (const p of result.rowCoords) {
    const i = idx(p.r, p.c, cfg);
    next[i] = { ...(next[i] as PlacedCard), lockedRow: true };
  }
  for (const p of result.colCoords) {
    const i = idx(p.r, p.c, cfg);
    next[i] = { ...(next[i] as PlacedCard), lockedCol: true };
  }
  return { board: next, result };
}

export function legalCells(board: Board, cfg: Config = CONFIG): Coord[] {
  const out: Coord[] = [];
  for (let r = 0; r < cfg.gridSize; r++) {
    for (let c = 0; c < cfg.gridSize; c++) {
      if (isLegalPlacement(board, r, c, cfg)) out.push({ r, c });
    }
  }
  return out;
}

/** A line sitting at the cap can never be extended. Render it as complete. */
export function isLineComplete(
  board: Board,
  r: number,
  c: number,
  axis: Axis,
  cfg: Config = CONFIG,
): boolean {
  return lineCoords(board, r, c, axis, cfg).length >= cfg.lineCap;
}

export interface PlacementScore extends ScoredPlacement {
  card: Card;
  at: Coord;
  rowLine: Card[];
  colLine: Card[];
  rowCoords: Coord[];
  colCoords: Coord[];
  rowEval: LineEval;
  colEval: LineEval;
}

/**
 * Score a placement: sum the row-line and the col-line, each counted on its
 * own by the lens. No second resource, no product — a placement is worth
 * what its lines add up to.
 *
 * The lens decides how a line of cards becomes a number — swapping poker for
 * cribbage changes nothing here. Works on a hypothetical placement, so the
 * preview overlay and the real placement run the identical code path.
 */
export function scorePlacement(
  board: Board,
  r: number,
  c: number,
  card: Card,
  cfg: Config = CONFIG,
  lens: Lens = getScoringLens(cfg),
): PlacementScore {
  return scoreCross(withCard(board, r, c, card, cfg), r, c, cfg, lens);
}

/**
 * Score the cross of lines through an occupied cell.
 *
 * Split out from `scorePlacement` so that cashing a cross runs the identical
 * code, rather than a parallel implementation that could drift from it. `mode`
 * only decides whether the value banks now: under lock-and-cash a placement
 * shows what it *would* be worth and banks nothing until cashed.
 */
export function scoreCross(
  board: Board,
  r: number,
  c: number,
  cfg: Config = CONFIG,
  lens: Lens = getScoringLens(cfg),
  mode: 'place' | 'cash' = 'place',
): PlacementScore {
  const next = board;
  const card = cellAt(board, r, c, cfg) as Card;

  const rowCoords = lineCoords(next, r, c, 'row', cfg);
  const colCoords = lineCoords(next, r, c, 'col', cfg);
  const rowLine = rowCoords.map((p) => next[idx(p.r, p.c, cfg)] as Card);
  const colLine = colCoords.map((p) => next[idx(p.r, p.c, cfg)] as Card);

  const keys = (ps: Coord[]) => ps.map((p) => `${p.r},${p.c}`);
  // A capped grid line always scores in full, so the window is the whole line.
  const scored = (label: string, cards: Card[], coords: Coord[]): ScoredLine => {
    const result = lens.evaluate(cards, cfg);
    return {
      label,
      cards,
      cellKeys: keys(coords),
      windowKeys: keys(coords),
      result,
      value: result.value,
    };
  };

  const rowLineScored = scored('Row', rowLine, rowCoords);
  const colLineScored = scored('Col', colLine, colCoords);
  const lines: ScoredLine[] = [rowLineScored, colLineScored];
  const total = rowLineScored.value + colLineScored.value;

  // Whether this cross banks its value now, expressed as a x0/x1 note — the
  // same multiplier semantics `notes` already carries for the hex ring bonus,
  // so the preview renders it without knowing what any of these mean.
  const { payOnCompleteOnly } = cfg.mechanics;
  let payout = 1;
  const notes: ScoreItem[] = [];
  if (cfg.mechanics.lockAndCash && mode === 'place') {
    payout = 0;
    notes.push({ label: 'Cash this cross to bank', points: 0 });
  } else if (payOnCompleteOnly) {
    const complete = rowCoords.length >= cfg.lineCap || colCoords.length >= cfg.lineCap;
    payout = complete ? 1 : 0;
    notes.push({ label: complete ? 'Line complete — banks' : 'No line complete', points: payout });
  }

  return {
    lines,
    notes,
    card,
    at: { r, c },
    rowLine,
    colLine,
    rowCoords,
    colCoords,
    rowEval: rowLineScored.result,
    colEval: colLineScored.result,
    score: total * payout,
  };
}
