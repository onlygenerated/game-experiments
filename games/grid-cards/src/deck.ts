import { CONFIG, type Config } from './config';

export type Suit = 'S' | 'H' | 'D' | 'C';

/** 2..10 face value, 11=J, 12=Q, 13=K, 14=A. */
export type Rank = number;

export interface Card {
  /** Stable identity so React keys and undo snapshots stay honest. */
  id: string;
  rank: Rank;
  suit: Suit;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_GLYPH: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const RANK_LABEL: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function cardLabel(card: Card): string {
  return `${RANK_LABEL[card.rank]}${SUIT_GLYPH[card.suit]}`;
}

export function rankChips(rank: Rank, cfg: Config = CONFIG): number {
  return cfg.rankChips[rank] ?? 0;
}

// --- PRNG -------------------------------------------------------------------

/** mulberry32: tiny, fast, good enough, and fully reproducible from a uint32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold an arbitrary seed string into a uint32 so "banana" is a valid seed. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Deck -------------------------------------------------------------------

export function freshDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${RANK_LABEL[rank]}${suit}`, rank, suit });
    }
  }
  return cards;
}

/** Fisher-Yates against a seeded PRNG. Pure: returns a new array. */
export function shuffle<T>(cards: readonly T[], rng: () => number): T[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function shuffledDeck(seed: string): Card[] {
  return shuffle(freshDeck(), mulberry32(hashSeed(seed)));
}

/**
 * Draw `n` cards off the top. Returns fewer than `n` if the deck runs dry.
 * Pure: neither input array is mutated.
 */
export function draw(deck: readonly Card[], n: number): { drawn: Card[]; deck: Card[] } {
  const take = Math.min(n, deck.length);
  return { drawn: deck.slice(0, take), deck: deck.slice(take) };
}
