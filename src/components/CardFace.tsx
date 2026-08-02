import { isRed, RANK_LABEL, SUIT_GLYPH, type Card } from '../deck';

export type CardSize = 'md' | 'lg';

/**
 * Sizes derive from the --cell / --hand-card-w custom properties in index.css,
 * so cards shrink with the board on a narrow screen instead of overflowing it.
 * `md` deliberately sits inside its cell so the line-highlight tint stays
 * visible as a frame around the card.
 */
const GEOMETRY: Record<CardSize, React.CSSProperties> = {
  md: {
    width: 'calc(var(--cell) * 0.68)',
    height: 'calc(var(--cell) * 0.84)',
    fontSize: 'calc(var(--cell) * 0.19)',
    borderRadius: 'calc(var(--cell) * 0.06)',
  },
  lg: {
    width: 'var(--hand-card-w)',
    height: 'calc(var(--hand-card-w) * 1.5)',
    fontSize: 'calc(var(--hand-card-w) * 0.22)',
    borderRadius: 'calc(var(--hand-card-w) * 0.08)',
  },
};

/** Rank + suit glyph, red or black. That is the whole visual budget. */
export function CardFace({ card, size = 'md' }: { card: Card; size?: CardSize }) {
  return (
    <div
      className={`flex select-none flex-col items-center justify-center bg-neutral-100 font-semibold leading-none shadow-sm ${
        isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'
      }`}
      style={GEOMETRY[size]}
    >
      <span>{RANK_LABEL[card.rank]}</span>
      <span className="leading-none" style={{ fontSize: '1.35em' }}>
        {SUIT_GLYPH[card.suit]}
      </span>
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
