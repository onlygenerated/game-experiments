import { useCallback, useEffect, useState } from 'react';
import { emptyBoard, type Board } from './rack';
import { loadBoard, saveBoard } from './storage';

/** Deep enough to cover a long session of fiddling, shallow enough that the
 *  snapshots never add up to anything. Each one shares structure with the last. */
const LIMIT = 200;

type History = { past: Board[]; present: Board; future: Board[] };

/**
 * Undo over whole-board snapshots. Affordable because every mutation in
 * `rack.ts` is structural sharing — an undo entry is a spine of a few objects,
 * not a copy of the tree.
 */
export function useBoardHistory() {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: loadBoard() ?? emptyBoard(),
    future: [],
  }));

  const board = history.present;

  useEffect(() => {
    saveBoard(board);
  }, [board]);

  /** Apply a mutation. A no-op mutation (one that returns the same board) is
   *  not worth an undo entry. */
  const commit = useCallback((fn: (b: Board) => Board) => {
    setHistory((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const present = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    });
  }, []);

  return {
    board,
    commit,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
