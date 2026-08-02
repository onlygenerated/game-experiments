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
    borderRadius: 'calc(var(--cell) * 0.08)',
  },
  lg: {
    width: 'var(--hand-card-w)',
    height: 'calc(var(--hand-card-w) * 1.5)',
    fontSize: 'calc(var(--hand-card-w) * 0.22)',
    borderRadius: 'calc(var(--hand-card-w) * 0.1)',
  },
};

/** Rank + suit glyph, red or black, on a lightly lit card stock. */
export function CardFace({
  card,
  size = 'md',
  className = '',
  style,
}: {
  card: Card;
  size?: CardSize;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`card-face flex select-none flex-col items-center justify-center font-semibold leading-none ${
        isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'
      } ${className}`}
      style={{ ...GEOMETRY[size], ...style }}
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
      className={`inline-block rounded bg-gradient-to-b from-white to-neutral-300 px-1 font-mono text-[11px] font-bold shadow-sm ${
        isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'
      }`}
    >
      {RANK_LABEL[card.rank]}
      {SUIT_GLYPH[card.suit]}
    </span>
  );
}
