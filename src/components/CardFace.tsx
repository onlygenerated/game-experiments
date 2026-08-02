import { isRed, RANK_LABEL, SUIT_GLYPH, type Card } from '../deck';

// `md` must sit comfortably inside a board cell so the line-highlight tint
// stays visible as a frame around the card.
const SIZES = {
  md: 'w-12 h-16 text-sm',
  lg: 'w-16 h-24 text-base',
} as const;

export type CardSize = keyof typeof SIZES;

/** Rank + suit glyph, red or black. That is the whole visual budget. */
export function CardFace({ card, size = 'md' }: { card: Card; size?: CardSize }) {
  return (
    <div
      className={`${SIZES[size]} flex select-none flex-col items-center justify-center rounded bg-neutral-100 font-semibold leading-none shadow-sm ${
        isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'
      }`}
    >
      <span>{RANK_LABEL[card.rank]}</span>
      <span className="text-lg leading-none">{SUIT_GLYPH[card.suit]}</span>
    </div>
  );
}

/** Inline one-line form, for the score log and preview line readouts. */
export function CardChip({ card }: { card: Card }) {
  return (
    <span
      className={`inline-block rounded bg-neutral-100 px-1 font-mono text-[11px] font-bold ${
        isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'
      }`}
    >
      {RANK_LABEL[card.rank]}
      {SUIT_GLYPH[card.suit]}
    </span>
  );
}
