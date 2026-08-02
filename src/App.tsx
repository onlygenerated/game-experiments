import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from './config';
import { isLegalPlacement, scorePlacement, type Coord } from './board';
import { discardCards, newGame, placeCard, type GameState } from './game';
import type { Card } from './deck';
import { TOUCH_QUERY, useMediaQuery, WIDE_QUERY } from './useMediaQuery';
import { useCardDrag } from './useCardDrag';
import { BoardGrid } from './components/BoardGrid';
import { CardFace } from './components/CardFace';
import { DevControls } from './components/DevControls';
import { HandTray } from './components/HandTray';
import { PreviewPanel } from './components/PreviewPanel';
import { ScoreLog } from './components/ScoreLog';
import { StatusBar } from './components/StatusBar';

const DEFAULT_SEED = 'grid-poker-1';
const DISCARD_MS = 420;
const DEAL_MS = 520;

const sameCell = (a: Coord | null, b: Coord | null) => !!a && !!b && a.r === b.r && a.c === b.c;

/** A discarded card, frozen at the screen position it left from. */
interface FlyingCard {
  card: Card;
  x: number;
  y: number;
  w: number;
  h: number;
  order: number;
}

export default function App() {
  // Undo is just a stack of whole states — every field rolls back together.
  const [history, setHistory] = useState<GameState[]>(() => [newGame(DEFAULT_SEED)]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [target, setTarget] = useState<Coord | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  const wide = useMediaQuery(WIDE_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);

  const state = history[history.length - 1];
  const playing = state.status === 'playing';

  const selectedIndex = selected.size === 1 ? [...selected][0] : null;
  const selectedCard = selectedIndex === null ? null : (state.hand[selectedIndex] ?? null);

  // --- actions ---------------------------------------------------------------

  const push = useCallback(
    (next: GameState) => {
      setHistory((h) => (next === h[h.length - 1] ? h : [...h, next]));
      setSelected(new Set());
      setTarget(null);
    },
    [],
  );

  const place = useCallback(
    (handIndex: number, cell: Coord) => push(placeCard(state, handIndex, cell.r, cell.c)),
    [push, state],
  );

  const toggle = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  // --- drag ------------------------------------------------------------------

  const cellAt = useCallback(
    (x: number, y: number): Coord | null => {
      const el = document.elementFromPoint(x, y)?.closest('[data-cell]');
      const [r, c] = (el?.getAttribute('data-cell') ?? '').split(',').map(Number);
      if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
      return isLegalPlacement(state.board, r, c) ? { r, c } : null;
    },
    [state.board],
  );

  const { drag, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useCardDrag({
    cellAt,
    onDrop: place,
    onTap: toggle,
    enabled: playing,
  });

  // A dragged card drives the preview even though it was never "selected".
  const activeCard = drag?.card ?? selectedCard;
  const activeTarget = drag ? drag.over : target;

  const preview = useMemo(() => {
    if (!playing || !activeCard || !activeTarget) return null;
    if (!isLegalPlacement(state.board, activeTarget.r, activeTarget.c)) return null;
    return scorePlacement(state.board, activeTarget.r, activeTarget.c, activeCard);
  }, [playing, activeCard, activeTarget, state.board]);

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
    const leaving = [...selected]
      .sort((a, b) => a - b)
      .map((i, order) => {
        const rect = document
          .querySelector(`[data-hand-index="${i}"]`)
          ?.getBoundingClientRect();
        const card = state.hand[i];
        return rect && card
          ? { card, x: rect.x, y: rect.y, w: rect.width, h: rect.height, order }
          : null;
      })
      .filter((v): v is FlyingCard => v !== null);

    setFlying(leaving);
    if (flyTimer.current) clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => setFlying([]), DISCARD_MS + leaving.length * 45);

    push(discardCards(state, [...selected]));
  }

  const justPlaced = state.log.length ? state.log[state.log.length - 1].at : null;

  // --- layout ----------------------------------------------------------------

  // Below the wide breakpoint the preview and hand dock to the bottom of the
  // screen, so the board can scroll without either going out of reach.
  const docked = !wide;
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) {
      setFooterH(0);
      return;
    }
    const ro = new ResizeObserver(() => setFooterH(el.offsetHeight));
    ro.observe(el);
    setFooterH(el.offsetHeight);
    return () => ro.disconnect();
  }, [docked]);

  // Cells use this as scroll-margin, so a targeted cell scrolls clear of the
  // footer rather than ending up behind it.
  useEffect(() => {
    document.documentElement.style.setProperty('--footer-h', `${docked ? footerH : 0}px`);
  }, [docked, footerH]);

  useEffect(() => {
    if (!docked || !target) return;
    document
      .querySelector(`[data-cell="${target.r},${target.c}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [docked, target]);

  /**
   * A pointer has already previewed the cell by hovering it, so a click places.
   * A finger has not, so the first tap targets the cell and shows the preview;
   * placing then takes a second tap or the footer's Place button.
   */
  function activateCell(cell: Coord) {
    if (selectedIndex === null) return;
    if (!touch || sameCell(target, cell)) place(selectedIndex, cell);
    else setTarget(cell);
  }

  function handleNewRun(seed: string) {
    setHistory([newGame(seed || DEFAULT_SEED)]);
    setSelected(new Set());
    setTarget(null);
  }

  function handleUndo() {
    if (history.length <= 1) return;
    setHistory((h) => h.slice(0, -1));
    setSelected(new Set());
    setTarget(null);
  }

  const n = selected.size;
  const hint = drag
    ? 'Drop on a highlighted cell'
    : n === 0
      ? touch
        ? 'Tap or drag a card'
        : 'Click or drag a card'
      : n === 1
        ? touch
          ? 'Tap a green cell'
          : 'Hover a legal cell to preview'
        : `${n} selected — discard only`;

  const handTray = (
    <HandTray
      hand={state.hand}
      selected={selected}
      onToggle={toggle}
      onDiscard={handleDiscard}
      discardsLeft={state.discardsLeft}
      disabled={!playing}
      hint={hint}
      dragIndex={drag?.handIndex ?? null}
      dealtIds={dealtIds}
      onCardPointerDown={onPointerDown}
      onCardPointerMove={onPointerMove}
      onCardPointerUp={onPointerUp}
      onCardPointerCancel={onPointerCancel}
    />
  );

  return (
    <div
      className="flex min-h-dvh flex-col gap-3 p-4 min-[1280px]:h-full"
      style={{ paddingBottom: docked ? footerH + 16 : undefined }}
    >
      <header className="flex flex-col gap-2 min-[1280px]:flex-row min-[1280px]:items-center min-[1280px]:gap-4">
        <div className="flex items-baseline gap-x-3 gap-y-1">
          <h1 className="shrink-0 text-base font-bold tracking-tight min-[1280px]:text-lg">
            Grid Poker <span className="text-neutral-500">prototype</span>
          </h1>
          <span className="truncate text-[11px] text-neutral-500">
            row → chips · col → mult · {CONFIG.lineCap}-card cap
            {CONFIG.partialHands.enabled && ' · partials ON'}
          </span>
          {/* Dev tools are a tuning aid, not gameplay — they cost too much of a
              phone screen to leave open by default. */}
          <button
            onClick={() => setDevOpen((v) => !v)}
            aria-expanded={devOpen}
            className="ml-auto shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 active:bg-neutral-800 min-[1280px]:hidden"
          >
            Dev {devOpen ? '▲' : '▼'}
          </button>
        </div>
        <div className={`min-[1280px]:ml-auto ${devOpen ? '' : 'hidden min-[1280px]:block'}`}>
          <DevControls
            seed={state.seed}
            onNewRun={handleNewRun}
            onUndo={handleUndo}
            canUndo={history.length > 1}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 min-[1280px]:flex-row min-[1280px]:gap-4">
        {/* Status reads first when the log is pushed below the fold. */}
        <div className="min-[1280px]:hidden">
          <StatusBar state={state} />
        </div>

        <section className="flex flex-col items-center gap-3 min-[1280px]:items-start">
          <BoardGrid
            board={state.board}
            selectedCard={activeCard}
            target={activeTarget}
            preview={preview}
            justPlaced={justPlaced}
            onHoverCell={(cell) => !touch && !drag && setTarget(cell)}
            onActivateCell={activateCell}
            interactive={playing}
            docked={docked}
          />

          {!docked && <div className="w-full">{handTray}</div>}

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 min-[1280px]:justify-start">
            <span>
              <span
                className="mr-1 inline-block h-2 w-4 rounded-sm align-middle"
                style={{ background: 'rgba(167,139,250,.75)' }}
              />
              row line complete
            </span>
            <span>
              <span
                className="mr-1 inline-block h-2 w-4 rounded-sm align-middle"
                style={{ background: 'rgba(244,114,182,.75)' }}
              />
              col line complete
            </span>
            <span className="text-sky-400">row = chips</span>
            <span className="text-amber-400">col = mult</span>
          </div>
        </section>

        <aside className="flex flex-col gap-3 min-[1280px]:min-h-0 min-[1280px]:w-96">
          <div className="hidden min-[1280px]:block">
            <StatusBar state={state} />
          </div>
          <ScoreLog log={state.log} />
        </aside>
      </main>

      {docked && (
        <div
          ref={footerRef}
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-white/10 bg-[#0d1015]/95 p-2 backdrop-blur"
        >
          {preview && (
            <PreviewPanel
              preview={preview}
              onPlace={() => place(drag?.handIndex ?? selectedIndex ?? -1, preview.at)}
              onCancel={() => setTarget(null)}
            />
          )}
          {handTray}
        </div>
      )}

      {/* Discarded cards, frozen where they left and animating away. */}
      {flying.map((f) => (
        <div
          key={f.card.id}
          className="pointer-events-none fixed z-40"
          style={{ left: f.x, top: f.y }}
        >
          <CardFace
            card={f.card}
            size="lg"
            className="animate-discard"
            style={{
              width: f.w,
              height: f.h,
              fontSize: f.w * 0.22,
              animationDelay: `${f.order * 45}ms`,
            }}
          />
        </div>
      ))}

      {/* The dragged card itself, tracking the pointer. */}
      {drag && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: drag.x,
            top: drag.y,
            transform: 'translate(-50%, -60%) rotate(-4deg) scale(1.12)',
            filter: 'drop-shadow(0 12px 18px rgba(0,0,0,.6))',
          }}
        >
          <CardFace card={drag.card} size="lg" />
        </div>
      )}
    </div>
  );
}
