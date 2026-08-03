import { useEffect, useRef, useState } from 'react';
import type { PlacementScore } from './board';
import type { HexPlacementScore } from './hex/board';
import { parseHex } from './hex/coords';
import { getLens } from './lens';
import { useRun, parseGrid } from './useRun';
import { WIDE_QUERY, useMediaQuery } from './useMediaQuery';
import { RulesetMenu } from './components/RulesetMenu';
import { MetricsPage } from './components/MetricsPage';
import { SetupPage } from './components/SetupPage';
import { ScoringPanel } from './components/ScoringPanel';
import { BoardGrid } from './components/BoardGrid';
import { HexBoardView } from './components/HexBoardView';
import { CardFace } from './components/CardFace';
import { DevControls } from './components/DevControls';
import { HandTray } from './components/HandTray';
import { PreviewPanel } from './components/PreviewPanel';
import { ScoreLog } from './components/ScoreLog';
import { StatusBar } from './components/StatusBar';

/**
 * Layout only.
 *
 * The rules, the run, the drag and every command live in `useRun`. What is
 * left here is where things sit on the screen and which of them is on top,
 * which is the half that presentation work needs to touch and rules work does
 * not. Anything that decides what a placement is *worth* belongs in the hook
 * or the engine, not in this file.
 */
export default function App() {
  const g = useRun();
  const {
    cfg,
    ruleset,
    run,
    state,
    playing,
    activeCard,
    activeTarget,
    preview,
    cashPreview,
    shownPreview,
    cashable,
    target,
    setTarget,
    selectedIndex,
    touch,
    drag,
    logRows,
    justPlacedKey,
    dealtIds,
    flying,
  } = g;

  // View state: which screen is open, and how tall the docked footer is. None
  // of it survives a reload or affects the run.
  const [devOpen, setDevOpen] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const wide = useMediaQuery(WIDE_QUERY);
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

  useEffect(() => {
    document.documentElement.style.setProperty('--footer-h', `${docked ? footerH : 0}px`);
  }, [docked, footerH]);

  useEffect(() => {
    if (!docked || !target) return;
    document
      .querySelector(`[data-cell="${target}"],[data-hex="${target}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [docked, target]);

  const n = g.activeSelection.size;
  const hint = drag
    ? 'Drop on a highlighted cell'
    : cfg.mechanics.lockAndCash && n <= 1
      ? touch
        ? 'Tap a green cell to build, a gold card to cash'
        : 'Place to build; click a gold card to cash its cross'
      : g.soleCard
      ? touch
        ? 'Tap a green cell, or burn it'
        : 'Place it, or burn it'
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
      cfg={cfg}
      hand={state.hand}
      selected={g.activeSelection}
      onToggle={g.toggle}
      soleCard={g.soleCard}
      onDiscard={g.handleDiscard}
      discardsLeft={state.discardsLeft}
      disabled={!playing}
      hint={hint}
      dragIndex={drag?.handIndex ?? null}
      dealtIds={dealtIds}
      {...g.pointerHandlers}
    />
  );

  if (showMetrics) return <MetricsPage onClose={() => setShowMetrics(false)} />;
  if (showSetup)
    return (
      <SetupPage
        initial={ruleset}
        onClose={() => setShowSetup(false)}
        onStart={(next) => {
          g.applyRuleset(next);
          setShowSetup(false);
        }}
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
            {getLens(cfg.lensId).name.toLowerCase()} ·{' '}
            {cfg.structure === 'hex'
              ? `hex, 3 axes, best ${cfg.hexWindow}`
              : `row → chips · col → mult · ${cfg.lineCap}-card cap`}
          </span>
          {/* Rules belong in front of the player, not behind a Dev toggle. */}
          <button
            onClick={() => setShowScoring(true)}
            className="ml-auto shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 active:bg-neutral-800 min-[1280px]:hidden"
          >
            Scoring
          </button>
          <button
            onClick={() => setDevOpen((v) => !v)}
            aria-expanded={devOpen}
            className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 active:bg-neutral-800 min-[1280px]:hidden"
          >
            Dev {devOpen ? '▲' : '▼'}
          </button>
        </div>
        <div
          className={`flex flex-col gap-2 min-[1280px]:ml-auto min-[1280px]:flex-row min-[1280px]:items-center ${devOpen ? '' : 'hidden min-[1280px]:flex'}`}
        >
          <RulesetMenu current={ruleset} onSelect={g.handleRuleset} />
          <button
            onClick={() => setShowScoring(true)}
            className="hidden shrink-0 rounded border border-neutral-700 px-3 py-1 text-sm font-semibold text-neutral-300 min-[1280px]:block min-[1280px]:hover:bg-neutral-800"
          >
            Scoring
          </button>
          <button
            onClick={() => setShowSetup(true)}
            className="shrink-0 rounded border border-neutral-700 px-3 py-1 text-sm font-semibold text-neutral-300 min-[1280px]:hover:bg-neutral-800"
          >
            Setup
          </button>
          <button
            onClick={() => setShowMetrics(true)}
            className="shrink-0 rounded border border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:py-1 min-[1280px]:hover:bg-neutral-800"
          >
            Metrics
          </button>
          <DevControls
            seed={state.seed}
            onNewRun={g.handleNewRun}
            onUndo={g.handleUndo}
            canUndo={g.canUndo}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 min-[1280px]:flex-row min-[1280px]:gap-4">
        <div className="min-[1280px]:hidden">
          <StatusBar state={state} cfg={cfg} />
        </div>

        <section className="flex flex-col items-center gap-3 min-[1280px]:items-start">
          <div className="flex items-start gap-4">
            {run.kind === 'hex' ? (
              <HexBoardView
                cfg={cfg}
                board={run.s.board}
                selectedCard={activeCard}
                target={activeTarget ? parseHex(activeTarget) : null}
                preview={preview as HexPlacementScore | null}
                justPlaced={justPlacedKey ? parseHex(justPlacedKey) : null}
                onHoverCell={(h) => !touch && !drag && setTarget(h ? `${h.q},${h.r}` : null)}
                onActivateCell={(h) => g.activateKey(`${h.q},${h.r}`)}
                interactive={playing}
              />
            ) : (
              <BoardGrid
                cfg={cfg}
                board={run.s.board}
                selectedCard={activeCard}
                target={activeTarget ? parseGrid(activeTarget) : null}
                preview={preview as PlacementScore | null}
                cashable={cashable}
                justPlaced={justPlacedKey ? parseGrid(justPlacedKey) : null}
                onHoverCell={(cell) =>
                  !touch && !drag && setTarget(cell ? `${cell.r},${cell.c}` : null)
                }
                onActivateCell={(cell) => g.activateKey(`${cell.r},${cell.c}`)}
                interactive={playing}
                docked={docked}
              />
            )}

            {/* The grid board positions its own side preview against the hovered
                row; the hex board has no row to anchor to, so it sits here. */}
            {!docked && ((run.kind === 'hex' && preview) || cashPreview) && (
              <PreviewPanel preview={(cashPreview ?? preview)!} />
            )}
          </div>

          {!docked && <div className="w-full">{handTray}</div>}

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 min-[1280px]:justify-start">
            <span className="text-sky-400">chips axis</span>
            <span className="text-amber-400">mult axis</span>
            {cfg.mechanics.lockAndCash && (
              <span className="text-amber-300">gold cards can be cashed · grey lines are sealed</span>
            )}
            {cfg.structure === 'hex' && <span className="text-violet-300">further out scores more</span>}
            {cfg.structure === 'hex' && <span>faded cards are outside the scoring window</span>}
          </div>
        </section>

        <aside className="flex flex-col gap-3 min-[1280px]:min-h-0 min-[1280px]:w-96">
          <div className="hidden min-[1280px]:block">
            <StatusBar state={state} cfg={cfg} />
          </div>
          <ScoreLog log={logRows} />
        </aside>
      </main>

      {showScoring && <ScoringPanel ruleset={ruleset} onClose={() => setShowScoring(false)} />}

      {docked && (
        <div
          ref={footerRef}
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-white/10 bg-[#0d1015]/95 p-2 backdrop-blur"
        >
          {/* Never while dragging. The footer is fixed to the bottom of the
              screen, so opening the full breakdown mid-drag grows it upward
              over the lower rows of the board — covering the very cell the
              card is being dragged to. The drag carries its own readout
              instead. */}
          {shownPreview && !drag && (
            <PreviewPanel
              preview={shownPreview}
              actionLabel={cashPreview ? 'Cash' : 'Place'}
              onPlace={() => {
                if (cashPreview && target) g.cash(target);
                // Unreachable during a drag, so the hand index is the selection.
                else if (activeTarget) g.place(selectedIndex ?? -1, activeTarget);
              }}
              onCancel={() => setTarget(null)}
            />
          )}
          {handTray}
        </div>
      )}

      {flying.map((f) => (
        <div key={f.card.id} className="pointer-events-none fixed z-40" style={{ left: f.x, top: f.y }}>
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

      {/* What the drop is worth, riding just above the card. Small enough not
          to cover the board, and it sits above the pointer rather than under
          it, so it never hides the cell being aimed at. */}
      {drag && preview && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: drag.x,
            top: `calc(${drag.y}px - var(--hand-card-w) * 1.12)`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="flex items-baseline gap-1 rounded-full border border-white/10 bg-[#0d1015]/95 px-2.5 py-1 font-mono text-[13px] font-bold shadow-lg backdrop-blur">
            <span className="text-sky-400">{preview.chips}</span>
            <span className="text-neutral-600">×</span>
            <span className="text-amber-400">{preview.mult}</span>
            <span className="text-neutral-600">=</span>
            <span className="text-base text-emerald-400">{preview.score}</span>
          </span>
        </div>
      )}
    </div>
  );
}
