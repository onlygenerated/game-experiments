import { CONFIG } from '../config';
import type { Card } from '../deck';
import { CardFace } from './CardFace';

/**
 * Cards toggle on click and can be dragged straight onto the board. A press
 * that never moves falls through to selection, so nothing about the original
 * click-to-select flow changed.
 */
export function HandTray({
  hand,
  selected,
  onToggle,
  onDiscard,
  discardsLeft,
  disabled,
  hint,
  dragIndex,
  dealtIds,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  onCardPointerCancel,
}: {
  hand: Card[];
  selected: ReadonlySet<number>;
  onToggle: (i: number) => void;
  onDiscard: () => void;
  discardsLeft: number;
  disabled: boolean;
  hint: string;
  /** Index currently being dragged, so its slot can read as vacated. */
  dragIndex: number | null;
  /** Card ids that just arrived, for the deal-in animation. */
  dealtIds: ReadonlySet<string>;
  onCardPointerDown: (i: number, card: Card, e: React.PointerEvent) => void;
  onCardPointerMove: (e: React.PointerEvent) => void;
  onCardPointerUp: (e: React.PointerEvent) => void;
  onCardPointerCancel: () => void;
}) {
  const n = selected.size;
  const canDiscard =
    !disabled &&
    discardsLeft > 0 &&
    n >= CONFIG.minDiscardSelection &&
    n <= CONFIG.maxDiscardSelection;

  return (
    <div className="panel flex flex-col gap-3 rounded-lg p-3 min-[1280px]:flex-row min-[1280px]:items-center">
      <div className="flex justify-center gap-1.5 min-[1280px]:justify-start min-[1280px]:gap-2">
        {hand.map((card, i) => {
          const isSel = selected.has(i);
          const isDragging = dragIndex === i;
          const isDealt = dealtIds.has(card.id);
          return (
            <button
              key={card.id}
              data-hand-index={i}
              disabled={disabled}
              onPointerDown={(e) => onCardPointerDown(i, card, e)}
              onPointerMove={onCardPointerMove}
              onPointerUp={onCardPointerUp}
              onPointerCancel={onCardPointerCancel}
              // detail === 0 means the click came from the keyboard; pointer
              // taps are already handled in onPointerUp, so this never doubles.
              onClick={(e) => e.detail === 0 && onToggle(i)}
              aria-pressed={isSel}
              className={`rounded transition-[transform,box-shadow] duration-150 ${
                isSel ? '-translate-y-2' : 'min-[1280px]:hover:-translate-y-1'
              } ${
                disabled
                  ? 'cursor-not-allowed opacity-50'
                  : isDragging
                    ? 'cursor-grabbing'
                    : 'cursor-grab active:cursor-grabbing'
              }`}
              style={{
                // The real card follows the pointer; leave a dimmed gap behind.
                opacity: isDragging ? 0.25 : undefined,
                filter: isSel ? 'drop-shadow(0 6px 10px rgba(16,185,129,.45))' : undefined,
              }}
            >
              <CardFace
                card={card}
                size="lg"
                className={isDealt ? 'animate-deal' : ''}
                style={{
                  animationDelay: isDealt ? `${i * 45}ms` : undefined,
                  outline: isSel ? '2px solid rgb(52 211 153)' : undefined,
                  outlineOffset: isSel ? '1px' : undefined,
                }}
              />
            </button>
          );
        })}
        {hand.length === 0 && (
          <div className="flex h-24 items-center px-4 text-sm text-neutral-500">Hand empty</div>
        )}
      </div>

      <div className="flex items-center gap-3 min-[1280px]:ml-auto min-[1280px]:flex-col min-[1280px]:items-end min-[1280px]:gap-2">
        <div className="flex-1 text-xs text-neutral-400 min-[1280px]:flex-none">{hint}</div>
        <button
          disabled={!canDiscard}
          onClick={onDiscard}
          className={`shrink-0 rounded px-3 py-2.5 text-sm font-semibold shadow-md transition-colors min-[1280px]:py-1.5 ${
            canDiscard
              ? 'cursor-pointer bg-gradient-to-b from-rose-500 to-rose-700 active:from-rose-400 active:to-rose-600 min-[1280px]:hover:from-rose-400 min-[1280px]:hover:to-rose-600'
              : 'cursor-not-allowed bg-neutral-800 text-neutral-500 shadow-none'
          }`}
        >
          Discard {n > 0 ? n : ''} ({discardsLeft})
        </button>
      </div>
    </div>
  );
}
