import { deserialize, serialize, type Board } from './rack';

const KEY = 'kangaroo.board.v1';

/**
 * Autosave, so closing the tab is not the same as throwing the tree away.
 *
 * Every access is guarded: a browser in private mode, or one told to block
 * site data, throws on the accessor itself. A tool that works offline must not
 * become a tool that fails to load offline.
 */
export function loadBoard(): Board | null {
  try {
    const text = localStorage.getItem(KEY);
    return text ? deserialize(text) : null;
  } catch {
    return null;
  }
}

export function saveBoard(board: Board): void {
  try {
    localStorage.setItem(KEY, serialize(board));
  } catch {
    /* Nothing to do and nothing worth interrupting the user over. */
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* as above */
  }
}
