import { useCallback, useEffect, useRef, useState } from 'react';
import type { Slot, Tile, Zone } from './rack';

/** Below this, the gesture was a tap, not a drag. Same threshold the card
 *  prototype uses, for the same reason: a press that never moves must still
 *  fall through to selection. */
const THRESHOLD = 6;

export type TileDrag = {
  rackId: string;
  tile: Tile;
  from: Zone;
  /** Viewport coords of the pointer, for the ghost. */
  x: number;
  y: number;
  /** The slot the tile would land in right now, or null if the pointer is off
   *  its own rack. */
  over: Slot | null;
};

/**
 * Where in a zone the pointer is pointing.
 *
 * Compared against tile midpoints with the dragged tile excluded, so the index
 * is already the "insert here after removal" one that `moveTile` wants. The
 * `y < bottom` guard is what makes this work on a rack that has wrapped onto a
 * second line — without it a pointer on row two would match a midpoint on row
 * one and the caret would jump backwards.
 */
function indexInZone(zone: HTMLElement, x: number, y: number, draggingId: string | null): number {
  const tiles = Array.from(zone.querySelectorAll<HTMLElement>('[data-tile-id]')).filter(
    (el) => el.dataset.tileId !== draggingId,
  );
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    if (y < r.bottom && x < r.left + r.width / 2) return i;
  }
  return tiles.length;
}

/** The zone under the pointer, if it belongs to `rackId`. A tile never leaves
 *  the rack it was born on, so every other zone is simply not a target. */
function slotAt(x: number, y: number, rackId: string, draggingId: string | null): Slot | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const zone = el instanceof HTMLElement ? el.closest<HTMLElement>('[data-zone]') : null;
    if (!zone) continue;
    if (zone.dataset.rackId !== rackId) return null;
    return {
      rackId,
      zone: zone.dataset.zone as Zone,
      index: indexInZone(zone, x, y, draggingId),
    };
  }
  return null;
}

/**
 * Pointer events, never HTML5 drag-and-drop — the latter has no touch story.
 * One code path covers mouse and finger.
 *
 * Selection is left to the native `click`, which is the one path that also
 * covers Enter/Space on a focused tile. The browser fires a click after a drag
 * too, though, which would toggle selection on the tile just dropped — so a
 * completed drag raises a flag for the click handler to `consumeDrag()`.
 */
export function useTileDrag({ onDrop }: { onDrop: (rackId: string, tileId: string, to: Slot) => void }) {
  const [drag, setDrag] = useState<TileDrag | null>(null);
  const pending = useRef<{
    startX: number;
    startY: number;
    rackId: string;
    tile: Tile;
    from: Zone;
    active: boolean;
  } | null>(null);
  const live = useRef<TileDrag | null>(null);
  live.current = drag;
  const dragged = useRef(false);

  /** True once, if the gesture that just finished was a drag rather than a tap. */
  const consumeDrag = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  const onPointerDown = useCallback(
    (rackId: string, tile: Tile, from: Zone, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      dragged.current = false;
      pending.current = { startX: e.clientX, startY: e.clientY, rackId, tile, from, active: false };
      // Capture keeps the gesture with the tile if the pointer outruns it.
      // The move/up listeners are on the window, so a browser that refuses the
      // capture costs nothing — hence swallowing rather than handling it.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no capture, no problem */
      }
    },
    [],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.active) {
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < THRESHOLD) return;
        p.active = true;
      }
      setDrag({
        rackId: p.rackId,
        tile: p.tile,
        from: p.from,
        x: e.clientX,
        y: e.clientY,
        over: slotAt(e.clientX, e.clientY, p.rackId, p.tile.id),
      });
    };

    const up = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (!p) return;
      if (!p.active) return;
      dragged.current = true;
      const to = live.current?.over ?? slotAt(e.clientX, e.clientY, p.rackId, p.tile.id);
      setDrag(null);
      // A drop outside the rack is a cancel, not a mistake to punish.
      if (to) onDrop(p.rackId, p.tile.id, to);
    };

    const cancel = () => {
      pending.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [onDrop]);

  return { drag, onPointerDown, consumeDrag };
}
