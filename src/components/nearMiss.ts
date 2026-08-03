import { useCallback, useEffect, useRef, useState } from 'react';
import type { Config } from '../config';
import {
  extendsLockedRun,
  hasOccupiedNeighbor,
  isBoardEmpty,
  projectedRunLength,
  type Board,
} from '../board';
import { hasHexNeighbor, isHexBoardEmpty, type HexBoard } from '../hex/board';
import type { Hex } from '../hex/coords';

export type NearMissReason = 'adjacency' | 'row-cap' | 'col-cap' | 'row-sealed' | 'col-sealed';

export const NEAR_MISS_LABEL: Record<NearMissReason, string> = {
  adjacency: "doesn't touch anything",
  'row-cap': 'row is at the cap',
  'col-cap': 'column is at the cap',
  'row-sealed': 'row is sealed',
  'col-sealed': 'column is sealed',
};

/**
 * Why an empty, on-board grid cell can't be played, checked in the same order
 * `isLegalPlacement` (board.ts) checks them — the first failing rule is the
 * one shown, same as the boolean it mirrors would have stopped on. Callers
 * only invoke this for cells already known to be empty; an occupied cell
 * reads as obviously illegal without needing a message, so that case (and the
 * off-board one, unreachable from a rendered cell) isn't in scope here.
 */
export function gridNearMissReason(
  board: Board,
  r: number,
  c: number,
  cfg: Config,
): NearMissReason | null {
  if (
    cfg.mechanics.requireAdjacency &&
    !hasOccupiedNeighbor(board, r, c, cfg) &&
    !isBoardEmpty(board)
  ) {
    return 'adjacency';
  }
  if (projectedRunLength(board, r, c, 'row', cfg) > cfg.lineCap) return 'row-cap';
  if (projectedRunLength(board, r, c, 'col', cfg) > cfg.lineCap) return 'col-cap';
  if (extendsLockedRun(board, r, c, 'row', cfg)) return 'row-sealed';
  if (extendsLockedRun(board, r, c, 'col', cfg)) return 'col-sealed';
  return null;
}

/** Hex has no cap or lock-and-cash concept, so adjacency is the only reason. */
export function hexNearMissReason(board: HexBoard, h: Hex, cfg: Config): NearMissReason | null {
  if (cfg.mechanics.requireAdjacency && !hasHexNeighbor(board, h) && !isHexBoardEmpty(board)) {
    return 'adjacency';
  }
  return null;
}

// A click needs to read, so the badge holds fully visible for a while — but
// that hold is a JS timer, not a CSS animation duration, so it survives
// `prefers-reduced-motion` collapsing the fade keyframes to ~0 intact. Only
// the fade in/out flourish is animated, and each is well under the 250ms cap.
const HOLD_MS = 900;
const FADE_MS = 160;

export interface NearMissBadge {
  id: number;
  key: string;
  reason: NearMissReason;
  leaving: boolean;
}

/**
 * Shared by `BoardGrid` and `HexBoardView`: an illegal click used to be a
 * silent no-op, so this gives it a one-shot "here's why" badge pinned to the
 * cell that was clicked. Never gates input — `trigger` only ever adds state
 * for a badge to render, the click that produced it already fell through to
 * nothing happening on the board.
 */
export function useNearMissBadge() {
  const [badge, setBadge] = useState<NearMissBadge | null>(null);
  const idRef = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback((key: string, reason: NearMissReason) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    const id = ++idRef.current;
    setBadge({ id, key, reason, leaving: false });
    holdTimer.current = setTimeout(() => {
      setBadge((b) => (b && b.id === id ? { ...b, leaving: true } : b));
      fadeTimer.current = setTimeout(() => {
        setBadge((b) => (b && b.id === id ? null : b));
      }, FADE_MS);
    }, HOLD_MS);
  }, []);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [],
  );

  return { badge, trigger };
}
