import { CONFIG, type Config } from './config';
import { isRed, type Card } from './deck';
import {
  getLens,
  type AxisRole,
  type Lens,
  type LineEval,
  type ScoredLine,
  type ScoredPlacement,
  type ScoreItem,
} from './lens';

export type Cell = Card | null;
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
  return true;
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
  /** Row-line evaluation. Feeds chips. */
  rowEval: LineEval;
  /** Col-line evaluation. Feeds mult. */
  colEval: LineEval;
}

/**
 * Score a placement. In the default 'split' mode chips come from the row-line
 * only and mult from the col-line only — the PRD's whole experiment, that the
 * two axes are separate resources. `axisMode` exists to test whether that
 * split is actually what creates the tension.
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
  lens: Lens = getLens(cfg.lensId),
): PlacementScore {
  const next = withCard(board, r, c, card, cfg);

  const rowCoords = lineCoords(next, r, c, 'row', cfg);
  const colCoords = lineCoords(next, r, c, 'col', cfg);
  const rowLine = rowCoords.map((p) => next[idx(p.r, p.c, cfg)] as Card);
  const colLine = colCoords.map((p) => next[idx(p.r, p.c, cfg)] as Card);

  const keys = (ps: Coord[]) => ps.map((p) => `${p.r},${p.c}`);
  // A capped grid line always scores in full, so the window is the whole line.
  const scored = (label: string, role: AxisRole, cards: Card[], coords: Coord[]): ScoredLine => {
    const result = lens.evaluate(cards, role, cfg);
    return {
      label,
      role,
      cards,
      cellKeys: keys(coords),
      windowKeys: keys(coords),
      result,
      value: result.value,
    };
  };

  const { axisMode, payOnCompleteOnly } = cfg.mechanics;

  // In 'suit' mode a red card scores the normal way round and a black card
  // reverses it, so which line you are feeding depends on the card in hand
  // rather than on the geometry. `rowEval`/`colEval` stay named for the axis
  // they came from; `chipsLine`/`multLine` name the role.
  const swapped = axisMode === 'suit' && !isRed(card.suit);

  let lines: ScoredLine[];
  let chips: number;
  let mult: number;

  if (axisMode === 'both') {
    // Every line feeds both resources. Mult sums with one base subtracted, so
    // a placement joining a single line is worth what it was before.
    lines = [
      scored('Row → chips', 'chips', rowLine, rowCoords),
      scored('Row → mult', 'mult', rowLine, rowCoords),
      scored('Col → chips', 'chips', colLine, colCoords),
      scored('Col → mult', 'mult', colLine, colCoords),
    ];
    chips = lines[0].value + lines[2].value;
    mult = Math.max(1, lines[1].value + lines[3].value - 1);
  } else {
    const chipsAxis = swapped ? 'Col' : 'Row';
    const multAxis = swapped ? 'Row' : 'Col';
    const chipsCards = swapped ? colLine : rowLine;
    const multCards = swapped ? rowLine : colLine;
    const chipsCoords = swapped ? colCoords : rowCoords;
    const multCoords = swapped ? rowCoords : colCoords;

    const chipsLine = scored(`${chipsAxis} → chips`, 'chips', chipsCards, chipsCoords);
    const multLine = scored(`${multAxis} → mult`, 'mult', multCards, multCoords);
    // Keep row before col in the preview regardless of which role each holds,
    // so the panel does not reorder itself between a red card and a black one.
    lines = swapped ? [multLine, chipsLine] : [chipsLine, multLine];
    chips = chipsLine.value;
    mult = multLine.value;
  }

  // Deferred payout: a line pays only once it can never grow again.
  const complete = rowCoords.length >= cfg.lineCap || colCoords.length >= cfg.lineCap;
  const payout = payOnCompleteOnly && !complete ? 0 : 1;
  const notes: ScoreItem[] = payOnCompleteOnly
    ? [{ label: complete ? 'Line complete — banks' : 'No line complete', points: payout }]
    : [];

  // `rowEval`/`colEval` are the per-axis evaluations in their scoring role, so
  // consumers that reach for them directly still get a meaningful number.
  const rowEval = lines.find((l) => l.label.startsWith('Row'))!.result;
  const colEval = lines.find((l) => l.label.startsWith('Col'))!.result;

  return {
    lines,
    notes,
    card,
    at: { r, c },
    rowLine,
    colLine,
    rowCoords,
    colCoords,
    rowEval,
    colEval,
    chips,
    mult,
    score: chips * mult * payout,
  };
}
