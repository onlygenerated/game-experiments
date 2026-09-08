import { useCallback, useRef, useState } from 'react';
import type { Card } from './deck';

export interface DragState<C> {
  handIndex: number;
  card: Card;
  /** Viewport coords of the pointer, for positioning the ghost. */
  x: number;
  y: number;
  /** Legal cell currently under the pointer, if any. */
  over: C | null;
}

/** Below this, the gesture is a click/tap rather than a drag. */
const THRESHOLD = 6;

/**
 * Pointer-event drag, not HTML5 drag-and-drop — the latter has no touch story.
 * A press that never moves far falls through to onTap, so selecting a card by
 * clicking still works exactly as before.
 */
export function useCardDrag<C>({
  cellAt,
  onDrop,
  onTap,
  enabled,
}: {
  /** Maps viewport coords to a legal cell, or null. */
  cellAt: (x: number, y: number) => C | null;
  onDrop: (handIndex: number, cell: C) => void;
  onTap: (handIndex: number) => void;
  enabled: boolean;
}) {
  const [drag, setDrag] = useState<DragState<C> | null>(null);
  const pending = useRef<{
    startX: number;
    startY: number;
    handIndex: number;
    card: Card;
    active: boolean;
  } | null>(null);

  const onPointerDown = useCallback(
    (handIndex: number, card: Card, e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      pending.current = { startX: e.clientX, startY: e.clientY, handIndex, card, active: false };
      // Capture so the drag survives the pointer leaving the card.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.active && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < THRESHOLD) return;
      p.active = true;
      setDrag({
        handIndex: p.handIndex,
        card: p.card,
        x: e.clientX,
        y: e.clientY,
        over: cellAt(e.clientX, e.clientY),
      });
    },
    [cellAt],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      setDrag(null);
      if (!p) return;
      if (!p.active) {
        onTap(p.handIndex);
        return;
      }
      const cell = cellAt(e.clientX, e.clientY);
      if (cell) onDrop(p.handIndex, cell);
    },
    [cellAt, onDrop, onTap],
  );

  const onPointerCancel = useCallback(() => {
    pending.current = null;
    setDrag(null);
  }, []);

  return { drag, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
