import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Config } from './config';
import { canCash, isLegalPlacement, scoreCross, scorePlacement } from './board';
import { cashCellAt, discardCards, newGame, placeCard, type GameState } from './game';
import { isLegalHexPlacement, scoreHexPlacement } from './hex/board';
import { discardHexCards, newHexGame, placeHexCard, type HexGameState } from './hex/game';
import { parseHex, type Hex } from './hex/coords';
import { DEFAULT_RULESET, getRuleset, type Ruleset } from './rulesets';
import type { ScoredPlacement } from './lens';
import type { Card } from './deck';
import { TOUCH_QUERY, useMediaQuery } from './useMediaQuery';
import { useCardDrag } from './useCardDrag';
import type { LogRow } from './components/ScoreLog';

/**
 * Everything the game *is*, separated from everything it *looks like*.
 *
 * This used to live inside `App.tsx`, which meant every change — a new scoring
 * mechanic or a new animation — landed in the same 600-line file. Splitting it
 * lets rules work and presentation work proceed independently: this module and
 * the engine beneath it are the logic side, `App.tsx` and `components/` are the
 * display side.
 *
 * The one place the two genuinely meet is the DOM: this hook reads
 * `data-cell` / `data-hex` to find the cell under a drag, and
 * `data-hand-index` to freeze a discarded card where it sat. Those three
 * attribute names are a contract between the layers — renaming one in a
 * component silently breaks dragging or the discard animation, so they are
 * called out here and in the UI backlog.
 */

const DEFAULT_SEED = 'grid-poker-1';
const DISCARD_MS = 420;
const DEAL_MS = 520;

/**
 * A run is one structure or the other. Coordinates travel through the UI as
 * opaque string keys — "r,c" on a grid, "q,r" on hexes — so drag, preview,
 * targeting and the whole footer stay a single code path.
 */
export type Run = { kind: 'grid'; s: GameState } | { kind: 'hex'; s: HexGameState };

export const startRun = (seed: string, cfg: Config): Run =>
  cfg.structure === 'hex'
    ? { kind: 'hex', s: newHexGame(seed, cfg) }
    : { kind: 'grid', s: newGame(seed, cfg) };

export const parseGrid = (key: string) => {
  const [r, c] = key.split(',').map(Number);
  return { r, c };
};

/** A discarded card, frozen at the screen position it left from. */
export interface FlyingCard {
  card: Card;
  x: number;
  y: number;
  w: number;
  h: number;
  order: number;
}

export function useRun() {
  const [ruleset, setRuleset] = useState<Ruleset>(() => getRuleset(DEFAULT_RULESET));
  const cfg = ruleset.config;

  // Undo is just a stack of whole states — every field rolls back together.
  const [history, setHistory] = useState<Run[]>(() => [
    startRun(DEFAULT_SEED, getRuleset(DEFAULT_RULESET).config),
  ]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [target, setTarget] = useState<string | null>(null);

  const touch = useMediaQuery(TOUCH_QUERY);

  const run = history[history.length - 1];
  const state = run.s;
  const playing = state.status === 'playing';

  // With a hand of one there is nothing to choose between, so the revealed card
  // is always live. Making the player click it first would be pure ceremony and
  // would hide the actual question the draft variant asks: where does it go.
  const soleCard = cfg.handSize === 1 && state.hand.length === 1;
  const activeSelection = soleCard ? new Set([0]) : selected;

  const selectedIndex = activeSelection.size === 1 ? [...activeSelection][0] : null;
  const selectedCard = selectedIndex === null ? null : (state.hand[selectedIndex] ?? null);

  // --- structure-dispatched actions ------------------------------------------

  const isLegalKey = useCallback(
    (key: string): boolean =>
      run.kind === 'hex'
        ? isLegalHexPlacement(run.s.board, parseHex(key), cfg)
        : isLegalPlacement(run.s.board, parseGrid(key).r, parseGrid(key).c, cfg),
    [run, cfg],
  );

  const scoreAt = useCallback(
    (key: string, card: Card): ScoredPlacement =>
      run.kind === 'hex'
        ? scoreHexPlacement(run.s.board, parseHex(key), card, cfg)
        : scorePlacement(run.s.board, parseGrid(key).r, parseGrid(key).c, card, cfg),
    [run, cfg],
  );

  const push = useCallback((next: Run) => {
    setHistory((h) => (next.s === h[h.length - 1].s ? h : [...h, next]));
    setSelected(new Set());
    setTarget(null);
  }, []);

  const place = useCallback(
    (handIndex: number, key: string) => {
      if (run.kind === 'hex') {
        push({ kind: 'hex', s: placeHexCard(run.s, handIndex, parseHex(key), cfg) });
      } else {
        const { r, c } = parseGrid(key);
        push({ kind: 'grid', s: placeCard(run.s, handIndex, r, c, cfg) });
      }
    },
    [push, run, cfg],
  );

  const toggle = useCallback(
    (i: number) => {
      // Deselecting the only card would leave nothing playable.
      if (soleCard) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
    },
    [soleCard],
  );

  // --- drag ------------------------------------------------------------------

  const cellAt = useCallback(
    (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y)?.closest('[data-cell],[data-hex]');
      const key = el?.getAttribute('data-cell') ?? el?.getAttribute('data-hex');
      if (!key) return null;
      return isLegalKey(key) ? key : null;
    },
    [isLegalKey],
  );

  const drag = useCardDrag<string>({
    cellAt,
    onDrop: place,
    onTap: toggle,
    enabled: playing,
  });

  // A dragged card drives the preview even though it was never "selected".
  const activeCard = drag.drag?.card ?? selectedCard;
  const activeTarget = drag.drag ? drag.drag.over : target;

  const preview = useMemo(() => {
    if (!playing || !activeCard || !activeTarget) return null;
    if (!isLegalKey(activeTarget)) return null;
    return scoreAt(activeTarget, activeCard);
  }, [playing, activeCard, activeTarget, isLegalKey, scoreAt]);

  // --- lock-and-cash ----------------------------------------------------------
  //
  // Only this variant has anything to bank, so everything here collapses to an
  // empty set and a null preview under every other ruleset.

  const cashable = useMemo(() => {
    const out = new Set<string>();
    if (!playing || run.kind !== 'grid' || !cfg.mechanics.lockAndCash) return out;
    for (let r = 0; r < cfg.gridSize; r++) {
      for (let c = 0; c < cfg.gridSize; c++) {
        if (canCash(run.s.board, r, c, cfg)) out.add(`${r},${c}`);
      }
    }
    return out;
  }, [playing, run, cfg]);

  // A placement preview wins if there is one: hovering an occupied cell with a
  // card in hand is not a legal placement, so the two can never both be live.
  const cashPreview = useMemo(() => {
    if (preview || drag.drag || !target || !cashable.has(target)) return null;
    if (run.kind !== 'grid') return null;
    const { r, c } = parseGrid(target);
    return scoreCross(run.s.board, r, c, cfg, undefined, 'cash');
  }, [preview, drag.drag, target, cashable, run, cfg]);

  const cash = useCallback(
    (key: string) => {
      if (run.kind !== 'grid') return;
      const { r, c } = parseGrid(key);
      push({ kind: 'grid', s: cashCellAt(run.s, r, c, cfg) });
    },
    [push, run, cfg],
  );

  const shownPreview = preview ?? cashPreview;

  // --- log, normalised so both structures render identically ------------------

  const logRows: LogRow[] = useMemo(
    () =>
      run.kind === 'hex'
        ? run.s.log.map((e) => ({ ...e, atLabel: `${e.at.q},${e.at.r}` }))
        : run.s.log.map((e) => ({ ...e, atLabel: `${e.at.r},${e.at.c}` })),
    [run],
  );

  const justPlacedKey = run.s.log.length
    ? run.kind === 'hex'
      ? `${(run.s.log.at(-1) as { at: Hex }).at.q},${(run.s.log.at(-1) as { at: Hex }).at.r}`
      : `${run.s.log.at(-1)!.at.r},${run.s.log.at(-1)!.at.c}`
    : null;

  // --- animation bookkeeping -------------------------------------------------

  const [dealtIds, setDealtIds] = useState<ReadonlySet<string>>(new Set());
  const prevHandIds = useRef<string[]>([]);

  useEffect(() => {
    const ids = state.hand.map((c) => c.id);
    const fresh = ids.filter((id) => !prevHandIds.current.includes(id));
    prevHandIds.current = ids;
    if (!fresh.length) return;
    setDealtIds(new Set(fresh));
    const t = setTimeout(() => setDealtIds(new Set()), DEAL_MS);
    return () => clearTimeout(t);
  }, [state.hand]);

  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (flyTimer.current && clearTimeout(flyTimer.current)), []);

  function handleDiscard() {
    // Freeze the outgoing cards where they sat, then let the hand refill under
    // them — the fly-away is purely decorative and never gates the state change.
    const leaving = [...activeSelection]
      .sort((a, b) => a - b)
      .map((i, order) => {
        const rect = document.querySelector(`[data-hand-index="${i}"]`)?.getBoundingClientRect();
        const card = state.hand[i];
        return rect && card
          ? { card, x: rect.x, y: rect.y, w: rect.width, h: rect.height, order }
          : null;
      })
      .filter((v): v is FlyingCard => v !== null);

    setFlying(leaving);
    if (flyTimer.current) clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => setFlying([]), DISCARD_MS + leaving.length * 45);

    const idx = [...activeSelection];
    push(
      run.kind === 'hex'
        ? { kind: 'hex', s: discardHexCards(run.s, idx, cfg) }
        : { kind: 'grid', s: discardCards(run.s, idx, cfg) },
    );
  }

  // --- commands ---------------------------------------------------------------

  /**
   * A pointer has already previewed the cell by hovering it, so a click places.
   * A finger has not, so the first tap targets the cell and shows the preview;
   * placing then takes a second tap or the footer's Place button.
   */
  function activateKey(key: string) {
    // Cashing needs no card in hand, so it is checked before the selection.
    if (cashable.has(key)) {
      if (!touch || target === key) cash(key);
      else setTarget(key);
      return;
    }
    if (selectedIndex === null) return;
    if (!touch || target === key) place(selectedIndex, key);
    else setTarget(key);
  }

  function applyRuleset(next: Ruleset) {
    setRuleset(next);
    setHistory([startRun(state.seed, next.config)]);
    setSelected(new Set());
    setTarget(null);
  }

  function handleNewRun(seed: string) {
    setHistory([startRun(seed || DEFAULT_SEED, cfg)]);
    setSelected(new Set());
    setTarget(null);
  }

  function handleUndo() {
    if (history.length <= 1) return;
    setHistory((h) => h.slice(0, -1));
    setSelected(new Set());
    setTarget(null);
  }

  return {
    // rules and state
    ruleset,
    cfg,
    run,
    state,
    playing,
    canUndo: history.length > 1,
    // selection
    activeSelection,
    selectedIndex,
    selectedCard,
    soleCard,
    toggle,
    // targeting and preview
    target,
    setTarget,
    activeCard,
    activeTarget,
    preview,
    cashPreview,
    shownPreview,
    cashable,
    isLegalKey,
    // input
    touch,
    drag: drag.drag,
    pointerHandlers: {
      onCardPointerDown: drag.onPointerDown,
      onCardPointerMove: drag.onPointerMove,
      onCardPointerUp: drag.onPointerUp,
      onCardPointerCancel: drag.onPointerCancel,
    },
    // commands
    place,
    cash,
    activateKey,
    applyRuleset,
    handleRuleset: (id: string) => applyRuleset(getRuleset(id)),
    handleNewRun,
    handleUndo,
    handleDiscard,
    // presentation feed
    logRows,
    justPlacedKey,
    dealtIds,
    flying,
  };
}

export type RunController = ReturnType<typeof useRun>;
