import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { isBoardEmpty, legalCells } from '../board';
import { newGame, placeCard } from '../game';

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
