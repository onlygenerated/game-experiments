import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { RANK_LABEL, type Card, type Rank, type Suit } from '../deck';
import {
  emptyBoard,
  idx,
  isLegalPlacement,
  isLineComplete,
  legalCells,
  lineCards,
  lineCoords,
  projectedRunLength,
  scorePlacement,
  withCard,
  type Board,
} from '../board';

const rankOf: Record<string, Rank> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

let seq = 0;
function card(tok: string): Card {
  const rank = rankOf[tok[0].toUpperCase()];
  const suit = tok[1].toUpperCase() as Suit;
  return { id: `${RANK_LABEL[rank]}${suit}#${seq++}`, rank, suit };
}

/**
 * Build a board from an ASCII map. Each row is space-separated; `..` is empty.
 *   place(['.. .. ..', '5H 6D ..', '.. .. ..'])
 */
function place(rows: string[], cfg: Config = CONFIG): Board {
  let board = emptyBoard(cfg);
  rows.forEach((row, r) => {
    row
      .trim()
      .split(/\s+/)
      .forEach((tok, c) => {
        if (tok !== '..') board = withCard(board, r, c, card(tok), cfg);
      });
  });
  return board;
}

const labels = (cards: Card[]) => cards.map((c) => `${RANK_LABEL[c.rank]}${c.suit}`);
const coordList = (cs: Array<{ r: number; c: number }>) => cs.map((p) => `${p.r},${p.c}`);

describe('lineCoords / lineCards', () => {
  const board = place([
    '.. .. .. .. .. .. ..',
    '.. 5H 6D 7S .. 9C ..',
    '.. .. 8H .. .. .. ..',
    '.. .. 2C .. .. .. ..',
  ]);

  it('walks left and right from the middle of a run', () => {
    expect(coordList(lineCoords(board, 1, 2, 'row'))).toEqual(['1,1', '1,2', '1,3']);
    expect(labels(lineCards(board, 1, 2, 'row'))).toEqual(['5H', '6D', '7S']);
  });

  it('returns the same run from either end', () => {
    expect(coordList(lineCoords(board, 1, 1, 'row'))).toEqual(['1,1', '1,2', '1,3']);
    expect(coordList(lineCoords(board, 1, 3, 'row'))).toEqual(['1,1', '1,2', '1,3']);
  });

  it('stops at a gap rather than jumping it', () => {
    // 9C at (1,5) is isolated from the 5H-7S run by the hole at (1,4).
    expect(coordList(lineCoords(board, 1, 5, 'row'))).toEqual(['1,5']);
  });

  it('extracts a vertical run independently of the horizontal one', () => {
    expect(labels(lineCards(board, 2, 2, 'col'))).toEqual(['6D', '8H', '2C']);
  });

  it('returns a single-card line for a card with no neighbours on that axis', () => {
    expect(labels(lineCards(board, 1, 1, 'col'))).toEqual(['5H']);
  });

  it('returns [] for an empty cell', () => {
    expect(lineCoords(board, 0, 0, 'row')).toEqual([]);
    expect(lineCards(board, 0, 0, 'col')).toEqual([]);
  });

  it('reads a run flush against the board edges', () => {
    const edge = place(['AS KS QS .. .. .. ..']);
    expect(labels(lineCards(edge, 0, 0, 'row'))).toEqual(['AS', 'KS', 'QS']);
    const bottom = place([
      '.. .. .. .. .. .. 2H',
      '.. .. .. .. .. .. 3H',
      '.. .. .. .. .. .. 4H',
    ]);
    expect(labels(lineCards(bottom, 2, 6, 'col'))).toEqual(['2H', '3H', '4H']);
  });

  it('keeps a full-width run intact when the cap allows it', () => {
    const wide: Config = { ...CONFIG, gridSize: 3, lineCap: 3 };
    const b = place(['2H 3H 4H'], wide);
    expect(labels(lineCards(b, 0, 1, 'row', wide))).toEqual(['2H', '3H', '4H']);
  });
});

describe('projectedRunLength', () => {
  const board = place([
    '.. .. .. .. .. .. ..',
    '.. 5H 6D .. 8S 9C ..',
    '.. .. .. .. .. .. ..',
  ]);

  it('counts the placed card itself on an isolated cell', () => {
    expect(projectedRunLength(board, 0, 0, 'row')).toBe(1);
  });

  it('extends an existing run', () => {
    expect(projectedRunLength(board, 1, 0, 'row')).toBe(3);
  });

  it('welds two runs together across a one-cell gap', () => {
    expect(projectedRunLength(board, 1, 3, 'row')).toBe(5);
  });

  it('measures each axis separately', () => {
    expect(projectedRunLength(board, 1, 3, 'col')).toBe(1);
  });
});

describe('isLegalPlacement', () => {
  const board = place([
    '.. .. .. .. .. .. ..',
    '.. .. 5H .. .. .. ..',
    '.. .. .. .. .. .. ..',
  ]);

  it('rejects an occupied cell', () => {
    expect(isLegalPlacement(board, 1, 2)).toBe(false);
  });

  it('rejects a cell with no orthogonal neighbour', () => {
    expect(isLegalPlacement(board, 3, 3)).toBe(false);
  });

  it('rejects a diagonal-only neighbour', () => {
    expect(isLegalPlacement(board, 2, 3)).toBe(false);
  });

  it('accepts each orthogonal neighbour', () => {
    expect(isLegalPlacement(board, 0, 2)).toBe(true);
    expect(isLegalPlacement(board, 2, 2)).toBe(true);
    expect(isLegalPlacement(board, 1, 1)).toBe(true);
    expect(isLegalPlacement(board, 1, 3)).toBe(true);
  });

  it('rejects off-board coordinates', () => {
    expect(isLegalPlacement(board, -1, 2)).toBe(false);
    expect(isLegalPlacement(board, 1, 7)).toBe(false);
  });

  it('rejects a placement that would push the row past the cap', () => {
    const full = place(['.. 2H 3H 4H 5H 6H ..']);
    expect(isLegalPlacement(full, 0, 0)).toBe(false);
    expect(isLegalPlacement(full, 0, 6)).toBe(false);
  });

  it('rejects a placement that would push the column past the cap', () => {
    const full = place([
      '.. .. 2H .. .. .. ..',
      '.. .. 3H .. .. .. ..',
      '.. .. 4H .. .. .. ..',
      '.. .. 5H .. .. .. ..',
      '.. .. 6H .. .. .. ..',
    ]);
    expect(isLegalPlacement(full, 5, 2)).toBe(false);
    // Sideways off that column is still fine — the row there is length 1 + 1.
    expect(isLegalPlacement(full, 5, 1)).toBe(false); // no neighbour
    expect(isLegalPlacement(full, 4, 1)).toBe(true);
  });

  it('rejects a bridge that would weld two runs past the cap', () => {
    const bridge = place(['2H 3H .. 4H 5H .. ..']);
    // Filling (0,2) would make a 5-run: legal at cap 5.
    expect(isLegalPlacement(bridge, 0, 2)).toBe(true);
    const wider = place(['2H 3H 4H .. 5H 6H 7H']);
    // Filling (0,3) would make a 7-run: illegal.
    expect(isLegalPlacement(wider, 0, 3)).toBe(false);
  });

  it('honours a retuned cap', () => {
    const cfg: Config = { ...CONFIG, lineCap: 3 };
    const b = place(['2H 3H 4H .. .. .. ..'], cfg);
    expect(isLegalPlacement(b, 0, 3, cfg)).toBe(false);
    expect(isLegalPlacement(b, 1, 0, cfg)).toBe(true);
  });
});

describe('legalCells', () => {
  it('finds exactly the four neighbours of a lone anchor', () => {
    const board = withCard(emptyBoard(), 3, 3, card('5H'));
    expect(coordList(legalCells(board)).sort()).toEqual(['2,3', '3,2', '3,4', '4,3']);
  });

  it('is empty on an empty board — nothing is adjacent to anything', () => {
    expect(legalCells(emptyBoard())).toEqual([]);
  });
});

describe('isLineComplete', () => {
  it('flags a run sitting at the cap', () => {
    const board = place(['2H 3H 4H 5H 6H .. ..']);
    expect(isLineComplete(board, 0, 0, 'row')).toBe(true);
    expect(isLineComplete(board, 0, 0, 'col')).toBe(false);
  });

  it('does not flag a shorter run', () => {
    const board = place(['2H 3H 4H .. .. .. ..']);
    expect(isLineComplete(board, 0, 1, 'row')).toBe(false);
  });
});

describe('withCard', () => {
  it('does not mutate the input board', () => {
    const before = emptyBoard();
    const after = withCard(before, 3, 3, card('5H'));
    expect(before[idx(3, 3)]).toBeNull();
    expect(after[idx(3, 3)]).not.toBeNull();
  });
});

describe('scorePlacement', () => {
  it('takes chips from the row and mult from the column', () => {
    //   col: 9C / 9D  -> Pair, mult 2
    //   row: 5H 6D 9C -> High Card, chips 5 + (5+6+9) = 25
    const board = place([
      '.. .. .. .. .. .. ..',
      '.. 5H 6D .. .. .. ..',
      '.. .. .. .. .. .. ..',
    ]);
    const withCol = withCard(board, 2, 3, card('9D'));
    const r = scorePlacement(withCol, 1, 3, card('9C'));

    expect(labels(r.rowLine)).toEqual(['5H', '6D', '9C']);
    expect(labels(r.colLine)).toEqual(['9C', '9D']);
    expect(r.rowEval.name).toBe('High Card');
    expect(r.colEval.name).toBe('Pair');
    expect(r.rowEval.items).toEqual([
      { label: 'High Card', points: 5 },
      { label: 'Ranks (3)', points: 20 },
    ]);
    expect(r.chips).toBe(25);
    expect(r.mult).toBe(2);
    expect(r.score).toBe(50);
  });

  it('gives a lone row-line the rank value only, with no hand bonus', () => {
    const board = place([
      '.. .. .. .. .. .. ..',
      '.. .. AH .. .. .. ..',
      '.. .. .. .. .. .. ..',
    ]);
    const r = scorePlacement(board, 2, 2, card('KS'));
    expect(r.rowLine).toHaveLength(1);
    expect(r.rowEval.items).toEqual([{ label: 'Ranks (1)', points: 10 }]);
    expect(r.chips).toBe(10); // K = 10, no High Card bonus
    expect(r.colEval.name).toBe('High Card');
    expect(r.mult).toBe(1);
    expect(r.score).toBe(10);
  });

  it('gives a lone col-line a mult of 1', () => {
    const board = place(['9H 9D .. .. .. .. ..']);
    const r = scorePlacement(board, 0, 2, card('9S'));
    expect(r.colLine).toHaveLength(1);
    // row: 9H 9D 9S -> Three of a Kind, 30 + 27 = 57
    expect(r.chips).toBe(57);
    expect(r.mult).toBe(1);
    expect(r.score).toBe(57);
  });

  it('ignores the column hand when computing chips', () => {
    // A strong column must not leak chips into the row half.
    const board = place([
      '.. .. 9H .. .. .. ..',
      '.. .. 9D .. .. .. ..',
      '.. .. 9S .. .. .. ..',
      '.. .. .. .. .. .. ..',
    ]);
    const r = scorePlacement(board, 3, 2, card('9C'));
    expect(r.colEval.name).toBe('Four of a Kind');
    expect(r.rowLine).toHaveLength(1);
    expect(r.chips).toBe(9); // rank value of the placed 9 only
    expect(r.mult).toBe(7);
    expect(r.score).toBe(63);
  });

  it('scores the full both-axes case', () => {
    // row: 2H 3H 4H 5H 6H -> Straight Flush, chips 100 + 20 = 120
    // col: 6H 6D 6S       -> Three of a Kind, mult 3
    const board = place([
      '2H 3H 4H 5H .. .. ..',
      '.. .. .. .. 6D .. ..',
      '.. .. .. .. 6S .. ..',
    ]);
    const r = scorePlacement(board, 0, 4, card('6H'));
    expect(r.rowEval.name).toBe('Straight Flush');
    expect(r.colEval.name).toBe('Three of a Kind');
    expect(r.chips).toBe(120);
    expect(r.mult).toBe(3);
    expect(r.score).toBe(360);
  });

  it('does not mutate the board it scores against', () => {
    const board = place(['9H .. .. .. .. .. ..']);
    scorePlacement(board, 0, 1, card('9D'));
    expect(board[idx(0, 1)]).toBeNull();
  });
});
