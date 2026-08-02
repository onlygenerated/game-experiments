import { CONFIG } from '../config';
import type { Card } from '../deck';
import { CardFace } from './CardFace';

/**
 * Cards toggle on click. Exactly one selected means "ready to place"; one to
 * five selected means "ready to discard". No modifier keys, no mode switch.
 */
export function HandTray({
  hand,
  selected,
  onToggle,
  onDiscard,
  discardsLeft,
  disabled,
}: {
  hand: Card[];
  selected: ReadonlySet<number>;
  onToggle: (i: number) => void;
  onDiscard: () => void;
  discardsLeft: number;
  disabled: boolean;
}) {
  const n = selected.size;
  const canDiscard =
    !disabled &&
    discardsLeft > 0 &&
    n >= CONFIG.minDiscardSelection &&
    n <= CONFIG.maxDiscardSelection;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="flex gap-2">
        {hand.map((card, i) => {
          const isSel = selected.has(i);
          return (
            <button
              key={card.id}
              disabled={disabled}
              onClick={() => onToggle(i)}
              className={`rounded transition-transform ${
                isSel ? '-translate-y-2 ring-2 ring-emerald-400' : 'hover:-translate-y-1'
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

      <div className="ml-auto flex flex-col items-end gap-2">
        <div className="text-xs text-neutral-400">
          {n === 0 && 'Click a card to select it'}
          {n === 1 && 'Hover a legal cell to preview'}
          {n > 1 && `${n} selected — discard only`}
        </div>
        <button
          disabled={!canDiscard}
          onClick={onDiscard}
          className={`rounded px-3 py-1.5 text-sm font-semibold ${
            canDiscard
              ? 'cursor-pointer bg-rose-600 hover:bg-rose-500'
              : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
          }`}
        >
          Discard {n > 0 ? n : ''} ({discardsLeft} left)
        </button>
      </div>
    </div>
  );
}
