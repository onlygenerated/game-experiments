import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { RANK_LABEL, type Card, type Rank, type Suit } from '../deck';
import { cribbageLens } from '../lens';
import {
  hexAdd,
  hexDistance,
  hexesWithinRadius,
  hexKey,
  hexNeighbors,
  hexToPixel,
  HEX_AXES,
  HEX_DIRS,
  ORIGIN,
  parseHex,
  type Hex,
} from '../hex/coords';
import {
  bestWindow,
  emptyHexBoard,
  hexLineCards,
  hexLineCoords,
  inHexBounds,
  isLegalHexPlacement,
  legalHexCells,
  scoreHexPlacement,
  withHexCard,
  type HexBoard,
} from '../hex/board';

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

/** Place cards along an axis starting at `from`, for line tests. */
function line(board: HexBoard, from: Hex, dir: Hex, toks: string[]): HexBoard {
  let b = board;
  let h = from;
  for (const t of toks) {
    b = withHexCard(b, h, card(t));
    h = hexAdd(h, dir);
  }
  return b;
}

const keys = (hs: Hex[]) => hs.map(hexKey);
const labels = (cs: Card[]) => cs.map((c) => `${RANK_LABEL[c.rank]}${c.suit}`);

describe('axial coordinates', () => {
  it('round-trips through a key', () => {
    expect(parseHex(hexKey({ q: 3, r: -2 }))).toEqual({ q: 3, r: -2 });
    expect(parseHex(hexKey({ q: -1, r: 0 }))).toEqual({ q: -1, r: 0 });
  });

  it('has six distinct neighbours, all one step away', () => {
    const ns = hexNeighbors(ORIGIN);
    expect(ns).toHaveLength(6);
    expect(new Set(keys(ns)).size).toBe(6);
    for (const n of ns) expect(hexDistance(ORIGIN, n)).toBe(1);
  });

  // Compared as keys, not objects: negating a zero component gives -0, which
  // deep equality treats as different from 0.
  it('pairs every direction with its exact opposite', () => {
    const dirs = keys([...HEX_DIRS]);
    for (const d of HEX_DIRS) {
      expect(dirs).toContain(hexKey({ q: -d.q, r: -d.r }));
    }
  });

  it('has three axes, none of which is another axis reversed', () => {
    expect(HEX_AXES).toHaveLength(3);
    const axes = keys([...HEX_AXES]);
    for (const a of HEX_AXES) {
      expect(axes).not.toContain(hexKey({ q: -a.q, r: -a.r }));
    }
  });

  it('every axis direction is a real neighbour step', () => {
    const dirs = keys([...HEX_DIRS]);
    for (const a of HEX_AXES) expect(dirs).toContain(hexKey(a));
  });
});

describe('hexDistance', () => {
  it('is zero to itself', () => {
    expect(hexDistance(ORIGIN, ORIGIN)).toBe(0);
  });

  it('counts straight-line steps', () => {
    expect(hexDistance(ORIGIN, { q: 3, r: 0 })).toBe(3);
    expect(hexDistance(ORIGIN, { q: 0, r: 3 })).toBe(3);
    expect(hexDistance(ORIGIN, { q: 3, r: -3 })).toBe(3);
  });

  it('does not treat (1,1) as adjacent — it is two steps', () => {
    // The trap of axial coords: not every +/-1 pair is a neighbour.
    expect(hexDistance(ORIGIN, { q: 1, r: 1 })).toBe(2);
    expect(hexNeighbors(ORIGIN)).not.toContainEqual({ q: 1, r: 1 });
  });

  it('is symmetric', () => {
    const a = { q: 2, r: -1 };
    const b = { q: -1, r: 3 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('satisfies the triangle inequality on a sample', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 2, r: -1 };
    const c = { q: -1, r: 2 };
    expect(hexDistance(a, c)).toBeLessThanOrEqual(hexDistance(a, b) + hexDistance(b, c));
  });
});

describe('hexesWithinRadius', () => {
  it('produces the 3n^2+3n+1 hexes of a radius-n disc', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(hexesWithinRadius(n)).toHaveLength(3 * n * n + 3 * n + 1);
    }
  });

  it('contains nothing beyond the radius', () => {
    for (const h of hexesWithinRadius(3)) {
      expect(hexDistance(h, ORIGIN)).toBeLessThanOrEqual(3);
    }
  });

  it('has no duplicates', () => {
    const hs = hexesWithinRadius(3);
    expect(new Set(keys(hs)).size).toBe(hs.length);
  });
});

describe('hexToPixel', () => {
  it('puts the origin at 0,0', () => {
    expect(hexToPixel(ORIGIN, 10)).toEqual({ x: 0, y: 0 });
  });

  it('spaces neighbours one hex apart, not overlapping', () => {
    const a = hexToPixel(ORIGIN, 10);
    for (const n of hexNeighbors(ORIGIN)) {
      const p = hexToPixel(n, 10);
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      expect(d).toBeGreaterThan(15);
      expect(d).toBeLessThan(20);
    }
  });
});

describe('hexLineCoords', () => {
  it('returns [] for an empty hex', () => {
    expect(hexLineCoords(emptyHexBoard(), ORIGIN, 0)).toEqual([]);
  });

  it('returns a lone card as a line of one on every axis', () => {
    const b = withHexCard(emptyHexBoard(), ORIGIN, card('5H'));
    for (const axis of [0, 1, 2] as const) {
      expect(keys(hexLineCoords(b, ORIGIN, axis))).toEqual(['0,0']);
    }
  });

  it('walks both ways along the E-W axis', () => {
    const b = line(emptyHexBoard(), { q: -2, r: 0 }, HEX_AXES[0], ['2H', '3H', '4H', '5H']);
    expect(keys(hexLineCoords(b, { q: 0, r: 0 }, 0))).toEqual(['-2,0', '-1,0', '0,0', '1,0']);
    expect(labels(hexLineCards(b, { q: 0, r: 0 }, 0))).toEqual(['2H', '3H', '4H', '5H']);
  });

  it('gives the same run from either end', () => {
    const b = line(emptyHexBoard(), { q: -2, r: 0 }, HEX_AXES[0], ['2H', '3H', '4H']);
    expect(keys(hexLineCoords(b, { q: -2, r: 0 }, 0))).toEqual(
      keys(hexLineCoords(b, { q: 0, r: 0 }, 0)),
    );
  });

  it('stops at a gap instead of jumping it', () => {
    let b = withHexCard(emptyHexBoard(), { q: 0, r: 0 }, card('2H'));
    b = withHexCard(b, { q: 2, r: 0 }, card('3H')); // gap at (1,0)
    expect(keys(hexLineCoords(b, { q: 0, r: 0 }, 0))).toEqual(['0,0']);
  });

  it('keeps the three axes independent', () => {
    // A card at the origin with one neighbour on each axis.
    let b = withHexCard(emptyHexBoard(), ORIGIN, card('9H'));
    b = withHexCard(b, HEX_AXES[0], card('2S'));
    b = withHexCard(b, HEX_AXES[1], card('3S'));
    b = withHexCard(b, HEX_AXES[2], card('4S'));
    expect(labels(hexLineCards(b, ORIGIN, 0))).toEqual(['9H', '2S']);
    expect(labels(hexLineCards(b, ORIGIN, 1))).toEqual(['9H', '3S']);
    expect(labels(hexLineCards(b, ORIGIN, 2))).toEqual(['9H', '4S']);
  });

  it('runs uncapped — a nine-card line stays one line', () => {
    const b = line(emptyHexBoard(), { q: -4, r: 0 }, HEX_AXES[0], [
      '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', 'TH',
    ]);
    expect(hexLineCoords(b, ORIGIN, 0)).toHaveLength(9);
  });
});

describe('isLegalHexPlacement', () => {
  it('opens the whole disc when nothing is placed', () => {
    const b = emptyHexBoard();
    expect(legalHexCells(b)).toHaveLength(3 * 16 + 3 * 4 + 1);
    expect(isLegalHexPlacement(b, { q: 4, r: 0 })).toBe(true);
  });

  it('rejects hexes beyond the radius', () => {
    expect(inHexBounds({ q: 5, r: 0 })).toBe(false);
    expect(isLegalHexPlacement(emptyHexBoard(), { q: 5, r: 0 })).toBe(false);
  });

  it('rejects an occupied hex', () => {
    const b = withHexCard(emptyHexBoard(), ORIGIN, card('5H'));
    expect(isLegalHexPlacement(b, ORIGIN)).toBe(false);
  });

  it('collapses to exactly the six neighbours once one card is down', () => {
    const b = withHexCard(emptyHexBoard(), ORIGIN, card('5H'));
    const legal = legalHexCells(b);
    expect(legal).toHaveLength(6);
    expect(keys(legal).sort()).toEqual(keys(hexNeighbors(ORIGIN)).sort());
  });

  it('rejects a hex two steps away', () => {
    const b = withHexCard(emptyHexBoard(), ORIGIN, card('5H'));
    expect(isLegalHexPlacement(b, { q: 2, r: 0 })).toBe(false);
    expect(isLegalHexPlacement(b, { q: 1, r: 1 })).toBe(false);
  });

  it('never caps line length', () => {
    // A full-diameter row must still accept extension at the ends.
    const b = line(emptyHexBoard(), { q: -4, r: 0 }, HEX_AXES[0], [
      '2H', '3H', '4H', '5H', '6H', '7H', '8H',
    ]);
    expect(isLegalHexPlacement(b, { q: 3, r: 0 })).toBe(true);
  });

  it('honours a retuned radius', () => {
    const cfg: Config = { ...CONFIG, hexRadius: 1 };
    expect(legalHexCells(emptyHexBoard(), cfg)).toHaveLength(7);
    expect(isLegalHexPlacement(emptyHexBoard(), { q: 2, r: 0 }, cfg)).toBe(false);
  });
});

describe('bestWindow', () => {
  const cfg = CONFIG;

  it('takes the whole line when it is shorter than the window', () => {
    const cards = [card('7H'), card('8S')];
    const coords = [ORIGIN, HEX_AXES[0]];
    const w = bestWindow(cards, coords, cribbageLens, 'chips', cfg);
    expect(w.cards).toHaveLength(2);
    expect(w.result.value).toBeGreaterThan(0); // 7+8 is a fifteen
  });

  it('picks the strongest stretch of a long line', () => {
    // A dead prefix then a 5-5-5-J cluster: the window must find the cluster.
    const cards = [card('2H'), card('9S'), card('5H'), card('5S'), card('5D'), card('JC')];
    const coords = cards.map((_, i) => ({ q: i, r: 0 }));
    const w = bestWindow(cards, coords, cribbageLens, 'chips', cfg);
    expect(labels(w.cards)).toContain('5H');
    expect(labels(w.cards)).toContain('JC');
    expect(labels(w.cards)).not.toContain('2H');
  });

  it('never returns more cards than the configured window', () => {
    const cards = Array.from({ length: 9 }, (_, i) => card(`${(i % 8) + 2}H`));
    const coords = cards.map((_, i) => ({ q: i, r: 0 }));
    expect(bestWindow(cards, coords, cribbageLens, 'chips', cfg).cards).toHaveLength(cfg.hexWindow);
  });

  it('keeps coords aligned with the cards it chose', () => {
    const cards = [card('2H'), card('9S'), card('7H'), card('8S')];
    const coords = cards.map((_, i) => ({ q: i, r: 0 }));
    const w = bestWindow(cards, coords, cribbageLens, 'chips', { ...cfg, hexWindow: 2 });
    expect(w.cards).toHaveLength(2);
    expect(w.coords).toHaveLength(2);
    expect(w.coords[0]).toEqual({ q: 2, r: 0 }); // the 7H/8S fifteen
  });

  it('handles an empty line', () => {
    const w = bestWindow([], [], cribbageLens, 'mult', cfg);
    expect(w.cards).toEqual([]);
  });
});

describe('scoreHexPlacement', () => {
  const cfg: Config = { ...CONFIG, lensId: 'cribbage', hexRingBonus: 0 };

  it('scores all three axes', () => {
    const r = scoreHexPlacement(emptyHexBoard(), ORIGIN, card('5H'), cfg);
    expect(r.lines).toHaveLength(3);
    expect(r.lines.map((l) => l.name)).toEqual(['E–W', 'NE–SW', 'NW–SE']);
  });

  it('takes chips from axis 0 only', () => {
    // A fifteen on the E-W axis; the diagonals are bare.
    const b = withHexCard(emptyHexBoard(), { q: -1, r: 0 }, card('7H'));
    const r = scoreHexPlacement(b, ORIGIN, card('8S'), cfg);
    expect(r.lines[0].window.cards).toHaveLength(2);
    expect(r.chips).toBe(r.lines[0].window.result.value);
    expect(r.mult).toBe(1);
  });

  it('lets either diagonal lift mult, and sums them', () => {
    const bare = scoreHexPlacement(emptyHexBoard(), ORIGIN, card('8S'), cfg);
    expect(bare.mult).toBe(1);

    // One diagonal makes a fifteen -> mult above 1.
    let b = withHexCard(emptyHexBoard(), { q: -1, r: 1 }, card('7H'));
    const one = scoreHexPlacement(b, ORIGIN, card('8S'), cfg);
    expect(one.mult).toBeGreaterThan(1);

    // Both diagonals counting must beat either alone.
    b = withHexCard(b, { q: 0, r: -1 }, card('7D'));
    const both = scoreHexPlacement(b, ORIGIN, card('8S'), cfg);
    expect(both.mult).toBeGreaterThan(one.mult);
  });

  it('never lets mult fall below 1', () => {
    const r = scoreHexPlacement(emptyHexBoard(), ORIGIN, card('2H'), cfg);
    expect(r.mult).toBe(1);
    expect(r.score).toBe(r.chips);
  });

  it('applies the ring bonus by distance from the origin', () => {
    const withBonus: Config = { ...cfg, hexRingBonus: 0.1 };
    const centre = scoreHexPlacement(emptyHexBoard(), ORIGIN, card('KH'), withBonus);
    const out = scoreHexPlacement(emptyHexBoard(), { q: 3, r: 0 }, card('KH'), withBonus);
    expect(centre.ring).toBe(0);
    expect(centre.ringBonus).toBe(1);
    expect(out.ring).toBe(3);
    expect(out.ringBonus).toBeCloseTo(1.3);
    expect(out.score).toBeGreaterThan(centre.score);
  });

  it('does not mutate the board it scores against', () => {
    const b = withHexCard(emptyHexBoard(), ORIGIN, card('5H'));
    scoreHexPlacement(b, { q: 1, r: 0 }, card('6H'), cfg);
    expect(b.size).toBe(1);
  });

  it('scores a long line by its best window, not its whole length', () => {
    const b = line(emptyHexBoard(), { q: -4, r: 0 }, HEX_AXES[0], [
      '2H', '2S', '2D', '2C', '9H', '9S', '9D',
    ]);
    const r = scoreHexPlacement(b, { q: 3, r: 0 }, card('9C'), cfg);
    expect(r.lines[0].coords).toHaveLength(8); // whole run highlighted
    expect(r.lines[0].window.cards).toHaveLength(cfg.hexWindow); // only five scored
  });
});
