import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { isBoardEmpty, legalCells } from '../board';
import { cashCellAt, newGame, placeCard } from '../game';

const blank: Config = { ...CONFIG, startWithAnchor: false };

describe('newGame — anchor', () => {
  it('deals a centre card by default', () => {
    const s = newGame('seed-a');
    expect(isBoardEmpty(s.board)).toBe(false);
    expect(s.board.filter(Boolean)).toHaveLength(1);
  });

  it('starts empty when the anchor is off', () => {
    const s = newGame('seed-a', blank);
    expect(isBoardEmpty(s.board)).toBe(true);
  });

  it('keeps the would-be anchor in the deck rather than burning it', () => {
    expect(newGame('seed-a').deck).toHaveLength(52 - 1 - CONFIG.handSize);
    expect(newGame('seed-a', blank).deck).toHaveLength(52 - CONFIG.handSize);
  });

  it('does not immediately end the run on a blank board', () => {
    const s = newGame('seed-a', blank);
    expect(s.status).toBe('playing');
    expect(legalCells(s.board, blank)).toHaveLength(CONFIG.gridSize * CONFIG.gridSize);
  });

  it('lets the first placement choose any cell, then constrains to it', () => {
    let s = newGame('seed-a', blank);
    s = placeCard(s, 0, 0, 0, blank); // far corner
    expect(s.board.filter(Boolean)).toHaveLength(1);
    expect(s.placementsLeft).toBe(CONFIG.placementsPerRun - 1);

    const cells = legalCells(s.board, blank).map((p) => `${p.r},${p.c}`);
    expect(cells.sort()).toEqual(['0,1', '1,0']);
  });

  it('scores a lone opening placement without a hand bonus', () => {
    let s = newGame('seed-a', blank);
    const card = s.hand[0];
    s = placeCard(s, 0, 3, 3, blank);
    expect(s.log).toHaveLength(1);
    expect(s.log[0].card.id).toBe(card.id);
    expect(s.log[0].rowLine).toHaveLength(1);
    expect(s.log[0].mult).toBe(1);
  });
});

describe('lock-and-cash run flow', () => {
  const cash: Config = { ...CONFIG, mechanics: { ...CONFIG.mechanics, lockAndCash: true } };
  const anchor = { r: Math.floor(CONFIG.gridSize / 2), c: Math.floor(CONFIG.gridSize / 2) };

  /** Place one card next to the anchor so there is a real cross to cash. */
  const built = () => placeCard(newGame('cash-seed', cash), 0, anchor.r, anchor.c + 1, cash);

  it('banks nothing on a placement', () => {
    const s = built();
    expect(s.log).toHaveLength(1);
    expect(s.score).toBe(0);
  });

  it('banks the cross and spends an action when cashing', () => {
    const before = built();
    const after = cashCellAt(before, anchor.r, anchor.c, cash);
    expect(after.score).toBeGreaterThan(0);
    // A cash costs an action from the same budget as a placement.
    expect(after.placementsLeft).toBe(before.placementsLeft - 1);
    // ...but not a card: cashing does not touch the hand.
    expect(after.hand).toEqual(before.hand);
  });

  it('is a no-op on a cross that is already spent', () => {
    const once = cashCellAt(built(), anchor.r, anchor.c, cash);
    const twice = cashCellAt(once, anchor.r, anchor.c, cash);
    expect(twice).toBe(once);
  });

  it('is a no-op under rules that do not have cashing', () => {
    const s = placeCard(newGame('cash-seed'), 0, anchor.r, anchor.c + 1);
    expect(cashCellAt(s, anchor.r, anchor.c)).toBe(s);
  });

  it('loses anything still uncashed when the actions run out', () => {
    // Spend the whole budget placing and never cash: the board is full of
    // value and the run banks zero. This is the tension the variant exists for.
    let s = newGame('cash-seed', cash);
    while (s.status === 'playing') {
      const cell = legalCells(s.board, cash)[0];
      s = placeCard(s, 0, cell.r, cell.c, cash);
    }
    expect(s.placementsLeft).toBe(0);
    expect(s.score).toBe(0);
    expect(s.status).toBe('lost');
  });
});
