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

type Pip = { x: number; y: number; flip?: boolean };

/**
 * Percent positions within the face, y=0 at the top. `flip` rotates that pip
 * 180deg so it points outward from centre, the way pips mirror across the
 * lower half of a real card. Center pips (3/5/9's true middle) never flip —
 * there's nothing to mirror against.
 */
const PIP_LAYOUT: Record<number, Pip[]> = {
  2: [
    { x: 50, y: 18 },
    { x: 50, y: 82, flip: true },
  ],
  3: [
    { x: 50, y: 18 },
    { x: 50, y: 50 },
    { x: 50, y: 82, flip: true },
  ],
  4: [
    { x: 25, y: 18 },
    { x: 75, y: 18 },
    { x: 25, y: 82, flip: true },
    { x: 75, y: 82, flip: true },
  ],
  5: [
    { x: 25, y: 18 },
    { x: 75, y: 18 },
    { x: 50, y: 50 },
    { x: 25, y: 82, flip: true },
    { x: 75, y: 82, flip: true },
  ],
  6: [
    { x: 25, y: 18 },
    { x: 75, y: 18 },
    { x: 25, y: 50 },
    { x: 75, y: 50 },
    { x: 25, y: 82, flip: true },
    { x: 75, y: 82, flip: true },
  ],
  7: [
    { x: 25, y: 18 },
    { x: 75, y: 18 },
    { x: 50, y: 32 },
    { x: 25, y: 50 },
    { x: 75, y: 50 },
    { x: 25, y: 82, flip: true },
    { x: 75, y: 82, flip: true },
  ],
  8: [
    { x: 25, y: 18 },
    { x: 75, y: 18 },
    { x: 50, y: 32 },
    { x: 25, y: 50 },
    { x: 75, y: 50 },
    { x: 50, y: 68, flip: true },
    { x: 25, y: 82, flip: true },
    { x: 75, y: 82, flip: true },
  ],
  9: [
    { x: 25, y: 15 },
    { x: 75, y: 15 },
    { x: 25, y: 34 },
    { x: 75, y: 34 },
    { x: 50, y: 50 },
    { x: 25, y: 66, flip: true },
    { x: 75, y: 66, flip: true },
    { x: 25, y: 85, flip: true },
    { x: 75, y: 85, flip: true },
  ],
  10: [
    { x: 25, y: 15 },
    { x: 75, y: 15 },
    { x: 50, y: 26 },
    { x: 25, y: 34 },
    { x: 75, y: 34 },
    { x: 25, y: 66, flip: true },
    { x: 75, y: 66, flip: true },
    { x: 50, y: 74, flip: true },
    { x: 25, y: 85, flip: true },
    { x: 75, y: 85, flip: true },
  ],
};

/** Small rank-over-suit stack, top-left and (rotated) bottom-right. */
function CardCorner({ card, mirrored }: { card: Card; mirrored?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute flex flex-col items-center ${
        mirrored ? 'bottom-[6%] right-[9%] rotate-180' : 'left-[9%] top-[6%]'
      } ${isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'}`}
      style={{ lineHeight: 0.85 }}
    >
      <span style={{ fontSize: '0.52em', fontWeight: 700 }}>{RANK_LABEL[card.rank]}</span>
      <span style={{ fontSize: '0.44em' }}>{SUIT_GLYPH[card.suit]}</span>
    </div>
  );
}

/** The face's middle: a pip pattern for 2-10, a monogram for J/Q/K, one large glyph for A. */
function CardCenter({ card }: { card: Card }) {
  const colorClass = isRed(card.suit) ? 'text-red-600' : 'text-neutral-900';

  if (card.rank === 14) {
    return <span className={`${colorClass}`} style={{ fontSize: '2.3em', lineHeight: 1 }}>{SUIT_GLYPH[card.suit]}</span>;
  }
  if (card.rank >= 11) {
    return (
      <div className={`flex flex-col items-center ${colorClass}`} style={{ lineHeight: 1 }}>
        <span style={{ fontSize: '1.5em', fontWeight: 800 }}>{RANK_LABEL[card.rank]}</span>
        <span style={{ fontSize: '0.9em', marginTop: '0.1em' }}>{SUIT_GLYPH[card.suit]}</span>
      </div>
    );
  }
  const pips = PIP_LAYOUT[card.rank] ?? [];
  return (
    <div className="relative h-full w-full">
      {pips.map((p, i) => (
        <span
          key={i}
          className={`absolute ${colorClass}`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: '0.6em',
            lineHeight: 1,
            transform: `translate(-50%, -50%)${p.flip ? ' rotate(180deg)' : ''}`,
          }}
        >
          {SUIT_GLYPH[card.suit]}
        </span>
      ))}
    </div>
  );
}

/** Corner indices, pips or monogram, and stock texture, on a lightly lit card. */
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
      className={`card-face relative select-none overflow-hidden font-semibold ${className}`}
      style={{ ...GEOMETRY[size], ...style }}
    >
      <CardCorner card={card} />
      <CardCorner card={card} mirrored />
      <div className="absolute inset-0 flex items-center justify-center">
        <CardCenter card={card} />
      </div>
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
