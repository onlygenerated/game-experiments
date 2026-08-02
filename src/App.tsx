import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from './config';
import { isLegalPlacement, scorePlacement, type Coord } from './board';
import { discardCards, newGame, placeCard, type GameState } from './game';
import { TOUCH_QUERY, useMediaQuery, WIDE_QUERY } from './useMediaQuery';
import { BoardGrid } from './components/BoardGrid';
import { DevControls } from './components/DevControls';
import { HandTray } from './components/HandTray';
import { PreviewPanel } from './components/PreviewPanel';
import { ScoreLog } from './components/ScoreLog';
import { StatusBar } from './components/StatusBar';

const DEFAULT_SEED = 'grid-poker-1';

const sameCell = (a: Coord | null, b: Coord | null) => !!a && !!b && a.r === b.r && a.c === b.c;

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

  const preview = useMemo(() => {
    if (!playing || !selectedCard || !target) return null;
    if (!isLegalPlacement(state.board, target.r, target.c)) return null;
    return scorePlacement(state.board, target.r, target.c, selectedCard);
  }, [playing, selectedCard, target, state.board]);

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

  function push(next: GameState) {
    if (next === state) return;
    setHistory((h) => [...h, next]);
    setSelected(new Set());
    setTarget(null);
  }

  function commit(cell: Coord) {
    if (selectedIndex === null) return;
    push(placeCard(state, selectedIndex, cell.r, cell.c));
  }

  /**
   * A pointer has already previewed the cell by hovering it, so a click places.
   * A finger has not, so the first tap targets the cell and shows the preview;
   * placing then takes a second tap or the footer's Place button.
   */
  function activateCell(cell: Coord) {
    if (!touch || sameCell(target, cell)) commit(cell);
    else setTarget(cell);
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
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
  const hint =
    n === 0
      ? 'Select a card'
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
      onDiscard={() => push(discardCards(state, [...selected]))}
      discardsLeft={state.discardsLeft}
      disabled={!playing}
      hint={hint}
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
            selectedCard={selectedCard}
            target={target}
            preview={preview}
            onHoverCell={(cell) => !touch && setTarget(cell)}
            onActivateCell={activateCell}
            interactive={playing}
            docked={docked}
          />

          {!docked && <div className="w-full">{handTray}</div>}

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 min-[1280px]:justify-start">
            <span>
              <span
                className="mr-1 inline-block h-2 w-4 rounded-sm align-middle"
                style={{ background: 'rgba(167,139,250,.65)' }}
              />
              row line complete
            </span>
            <span>
              <span
                className="mr-1 inline-block h-2 w-4 rounded-sm align-middle"
                style={{ background: 'rgba(244,114,182,.65)' }}
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
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-neutral-800 bg-neutral-950/95 p-2 backdrop-blur"
        >
          {preview && (
            <PreviewPanel
              preview={preview}
              onPlace={() => commit(preview.at)}
              onCancel={() => setTarget(null)}
            />
          )}
          {handTray}
        </div>
      )}
    </div>
  );
}
