import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { RANK_LABEL, type Card, type Rank, type Suit } from '../deck';
import { cribbageLens } from '../lens';
import type { Lens } from '../lens';
import { emptyHexBoard, scoreHexPlacement, withHexCard } from '../hex/board';
import { HEX_AXES, ORIGIN, hexAdd } from '../hex/coords';
import { emptyTileMap, tileMapFrom } from '../rooms/tile';
import { cardContribution, scoreRoomPlacement } from '../rooms/scoring';

const rankOf: Record<string, Rank> = {
  A: 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13,
};

let seq = 0;
function card(tok: string): Card {
  const rank = rankOf[tok[0].toUpperCase()];
  const suit = tok[1].toUpperCase() as Suit;
  return { id: `${RANK_LABEL[rank]}${suit}#${seq++}`, rank, suit };
}

const cfg: Config = { ...CONFIG, lensId: 'cribbage', hexRingBonus: 0 };

describe('cardContribution', () => {
  it('is the value with the card minus the value without it', () => {
    const a = card('7H');
    const b = card('8S'); // 7 + 8 = 15, a fifteen
    const withoutValue = cribbageLens.evaluate([a], cfg).value;
    const withValue = cribbageLens.evaluate([a, b], cfg).value;
    expect(cardContribution([a, b], 1, cribbageLens, cfg)).toBe(withValue - withoutValue);
    expect(withValue).toBeGreaterThan(withoutValue);
  });

  it('clamps a negative marginal contribution to zero', () => {
    // A contrived lens where the shorter line (the card removed) is worth
    // more than the longer one — the scenario the clamp exists for.
    const perverseLens: Lens = {
      id: 'perverse',
      name: 'Perverse',
      blurb: '',
      evaluate: (cards) => ({ name: '', items: [], value: cards.length === 2 ? 5 : 50 }),
      rules: () => [],
    };
    expect(cardContribution([card('2H'), card('3H')], 0, perverseLens, cfg)).toBe(0);
  });
});

describe('applyTileEffects / scoreRoomPlacement', () => {
  it('leaves the score unchanged when there is no tile at the placed cell', () => {
    const c = card('5H');
    const base = scoreHexPlacement(emptyHexBoard(), ORIGIN, c, cfg);
    const withTiles = scoreRoomPlacement(emptyHexBoard(), ORIGIN, c, emptyTileMap(), cfg);
    expect(withTiles).toEqual(base);
  });

  it('leaves the score unchanged for a marker tile — only cardMultiplier scores', () => {
    const c = card('5H');
    const tiles = tileMapFrom([[ORIGIN, { kind: 'marker', label: 'X' }]]);
    const base = scoreHexPlacement(emptyHexBoard(), ORIGIN, c, cfg);
    const withTiles = scoreRoomPlacement(emptyHexBoard(), ORIGIN, c, tiles, cfg);
    expect(withTiles.score).toBe(base.score);
  });

  it('doubles a lone card\'s contribution on every one of its (three, empty-neighbourhood) lines', () => {
    const tiles = tileMapFrom([[ORIGIN, { kind: 'cardMultiplier', multiplier: 2 }]]);
    const base = scoreHexPlacement(emptyHexBoard(), ORIGIN, card('5H'), cfg);
    const boosted = scoreRoomPlacement(emptyHexBoard(), ORIGIN, card('5H'), tiles, cfg);

    // Every axis is a lone-card line here, so each one's whole value is the
    // card's own contribution (removing it leaves an empty, zero-value line).
    expect(boosted.hexLines).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(boosted.hexLines[i].window.result.value).toBe(2 * base.hexLines[i].window.result.value);
    }
    expect(boosted.score).toBe(2 * base.score);
  });

  it('triples instead of doubles when the tile says ×3', () => {
    const tiles = tileMapFrom([[ORIGIN, { kind: 'cardMultiplier', multiplier: 3 }]]);
    const base = scoreHexPlacement(emptyHexBoard(), ORIGIN, card('5H'), cfg);
    const boosted = scoreRoomPlacement(emptyHexBoard(), ORIGIN, card('5H'), tiles, cfg);
    expect(boosted.score).toBe(3 * base.score);
  });

  it('boosts only the placed card\'s own contribution, not the whole line', () => {
    // 7H already on the board; 8S lands next to it and makes a fifteen (7+8).
    // The E-W line's total value includes the fifteen bonus *and* 7H's own
    // base chips — a tile on 8S's cell must boost neither of those, only
    // what 8S itself added.
    const neighbour = hexAdd(ORIGIN, HEX_AXES[0]);
    const board = withHexCard(emptyHexBoard(), ORIGIN, card('7H'));
    const eight = card('8S');
    const tiles = tileMapFrom([[neighbour, { kind: 'cardMultiplier', multiplier: 2 }]]);

    const base = scoreHexPlacement(board, neighbour, eight, cfg);
    const boosted = scoreRoomPlacement(board, neighbour, eight, tiles, cfg);

    const lineValueWithout = cribbageLens.evaluate([card('7H')], cfg).value; // 7H alone: base chips only
    const lineValueWith = base.hexLines[0].window.result.value; // 7H + 8S: fifteen + base chips
    const contribution = lineValueWith - lineValueWithout;

    expect(contribution).toBeGreaterThan(0);
    expect(boosted.hexLines[0].window.result.value).toBe(lineValueWith + contribution);
    // Doubling the whole line (the wrong interpretation) would give a
    // different, larger number — confirm the boost isn't that.
    expect(boosted.hexLines[0].window.result.value).not.toBe(2 * lineValueWith);

    // The placed card also sits alone on the other two axes, so it gets a
    // (smaller) contribution-sized bonus there too — sum all three deltas
    // to check the placement total, rather than assuming only axis 0 moved.
    const totalBonus = boosted.hexLines.reduce(
      (sum, l, i) => sum + (l.window.result.value - base.hexLines[i].window.result.value),
      0,
    );
    expect(boosted.score - base.score).toBe(totalBonus);
    expect(totalBonus).toBeGreaterThan(contribution);
  });

  it('does not boost a line whose scored window falls away from the placed cell', () => {
    // A strong pair on the far end, then a weak card added at the near end;
    // with a 2-card window the best slice is the strong pair, which excludes
    // the just-placed card entirely.
    const narrow: Config = { ...cfg, hexWindow: 2 };
    const west = { q: -1, r: 0 };
    const centre = ORIGIN;
    const east = { q: 1, r: 0 }; // the placed cell

    let board = withHexCard(emptyHexBoard(), west, card('5H'));
    board = withHexCard(board, centre, card('TH')); // 5H + TH = fifteen

    const tiles = tileMapFrom([[east, { kind: 'cardMultiplier', multiplier: 2 }]]);
    const base = scoreHexPlacement(board, east, card('2S'), narrow);
    const boosted = scoreRoomPlacement(board, east, card('2S'), tiles, narrow);

    // The E-W window that scored is the 5H/TH fifteen, not TH/2S — confirm
    // the placed cell isn't part of it before trusting the "no boost" result.
    expect(boosted.hexLines[0].window.coords.map((c) => `${c.q},${c.r}`)).not.toContain('1,0');
    expect(boosted.hexLines[0].window.result.value).toBe(base.hexLines[0].window.result.value);
  });

  it('does not mutate the board or tiles it scores against', () => {
    const board = emptyHexBoard();
    const tiles = tileMapFrom([[ORIGIN, { kind: 'cardMultiplier', multiplier: 2 }]]);
    scoreRoomPlacement(board, ORIGIN, card('5H'), tiles, cfg);
    expect(board.size).toBe(0);
    expect(tiles.size).toBe(1);
  });
});
