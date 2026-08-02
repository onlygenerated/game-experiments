import { CONFIG } from '../config';
import type { Card } from '../deck';
import { CardFace } from './CardFace';

/**
 * Cards toggle on click. Exactly one selected means "ready to place"; one to
 * five selected means "ready to discard". No modifier keys, no mode switch —
 * which also makes it work unchanged under a finger.
 */
export function HandTray({
  hand,
  selected,
  onToggle,
  onDiscard,
  discardsLeft,
  disabled,
  hint,
}: {
  hand: Card[];
  selected: ReadonlySet<number>;
  onToggle: (i: number) => void;
  onDiscard: () => void;
  discardsLeft: number;
  disabled: boolean;
  hint: string;
}) {
  const n = selected.size;
  const canDiscard =
    !disabled &&
    discardsLeft > 0 &&
    n >= CONFIG.minDiscardSelection &&
    n <= CONFIG.maxDiscardSelection;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 min-[1280px]:flex-row min-[1280px]:items-center">
      <div className="flex justify-center gap-1.5 min-[1280px]:justify-start min-[1280px]:gap-2">
        {hand.map((card, i) => {
          const isSel = selected.has(i);
          return (
            <button
              key={card.id}
              disabled={disabled}
              onClick={() => onToggle(i)}
              aria-pressed={isSel}
              className={`rounded transition-transform ${
                isSel ? '-translate-y-2 ring-2 ring-emerald-400' : 'min-[1280px]:hover:-translate-y-1'
              } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <CardFace card={card} size="lg" />
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
          className={`shrink-0 rounded px-3 py-2.5 text-sm font-semibold min-[1280px]:py-1.5 ${
            canDiscard
              ? 'cursor-pointer bg-rose-600 active:bg-rose-500 min-[1280px]:hover:bg-rose-500'
              : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
          }`}
        >
          Discard {n > 0 ? n : ''} ({discardsLeft})
        </button>
      </div>
    </div>
  );
}
