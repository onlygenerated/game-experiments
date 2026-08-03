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
import { RunEndPanel } from './components/RunEndPanel';
import type { Cascade, CascadeCell } from './components/cascade';

// Matches the count-up in StatusBar, so the flying total lands right as the
// number underneath finishes ticking to meet it.
const SCORE_FLY_MS = 220;

// Cascade: how long one cell's own flash lasts, and how far apart consecutive
// cells light up. Both under the 250ms cap on their own; the cascade as a
// whole runs longer only because it is many short animations in sequence,
// never one continuous one.
const CASCADE_FLASH_MS = 200;
const CASCADE_STAGGER_MS = 45;

// The ghost's resting lean when held still, same angle the static tilt used
// before this existed.
const DRAG_BASE_TILT = -4;
// Clamped so a fast flick tilts the card, never spins it.
const DRAG_MAX_TILT = 18;
// Degrees per px/ms of horizontal pointer speed.
const DRAG_TILT_GAIN = 7;

/** A placement's score, frozen at the cell it landed on, en route to the total. */
interface ScoreFly {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  amount: number;
}

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

  // The score-fly. logRows only grows on a placement or a cash — never on a
  // discard, an undo or a reset — so a length increase is exactly the moment
  // to launch one. Reusing the discard fly-away's approach: freeze a DOM
  // position, animate, never gate the state change underneath it.
  const [scoreFly, setScoreFly] = useState<ScoreFly | null>(null);
  const prevLogLen = useRef(logRows.length);
  const scoreFlyId = useRef(0);
  const scoreFlyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevLogLen.current;
    prevLogLen.current = logRows.length;
    if (logRows.length <= prev) return;

    const last = logRows[logRows.length - 1];
    const from = document
      .querySelector(run.kind === 'hex' ? `[data-hex="${last.atLabel}"]` : `[data-cell="${last.atLabel}"]`)
      ?.getBoundingClientRect();
    let to: DOMRect | undefined;
    document.querySelectorAll('[data-score-display]').forEach((el) => {
      if (to) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) to = r;
    });
    if (!from || !to) return;

    const id = ++scoreFlyId.current;
    setScoreFly({
      id,
      x: from.x + from.width / 2,
      y: from.y + from.height / 2,
      dx: to.x + to.width / 2 - (from.x + from.width / 2),
      dy: to.y + to.height / 2 - (from.y + from.height / 2),
      amount: last.score,
    });
    if (scoreFlyTimer.current) clearTimeout(scoreFlyTimer.current);
    scoreFlyTimer.current = setTimeout(
      () => setScoreFly((s) => (s?.id === id ? null : s)),
      SCORE_FLY_MS,
    );
  }, [logRows, run.kind]);

  useEffect(() => () => void (scoreFlyTimer.current && clearTimeout(scoreFlyTimer.current)), []);

  // Line-scoring cascade: light the cells that actually fed the score one at a
  // time, chips axis then mult axis, instead of the flat colour wash the board
  // already draws for them. Triggered by the same "logRows grew" signal as the
  // score-fly above — every log row, grid or hex, already carries `lines` with
  // `role` and `windowKeys` (the stretch that actually scored, not just the
  // full run), so this needed no change to a `main`-owned file either.
  const [cascade, setCascade] = useState<Cascade | null>(null);
  const prevCascadeLen = useRef(logRows.length);
  const cascadeGenId = useRef(0);
  const cascadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevCascadeLen.current;
    prevCascadeLen.current = logRows.length;
    if (logRows.length <= prev) return;

    const last = logRows[logRows.length - 1];
    const ordered = [
      ...last.lines.filter((l) => l.role === 'chips'),
      ...last.lines.filter((l) => l.role === 'mult'),
    ];
    const cells = new Map<string, CascadeCell>();
    for (const line of ordered) {
      for (const key of line.windowKeys) {
        if (!cells.has(key)) cells.set(key, { role: line.role, delay: cells.size * CASCADE_STAGGER_MS });
      }
    }

    if (cascadeTimer.current) clearTimeout(cascadeTimer.current);
    if (!cells.size) {
      setCascade(null);
      return;
    }
    const id = ++cascadeGenId.current;
    setCascade({ id, cells });
    const total = (cells.size - 1) * CASCADE_STAGGER_MS + CASCADE_FLASH_MS;
    cascadeTimer.current = setTimeout(() => setCascade((c) => (c?.id === id ? null : c)), total);
  }, [logRows]);

  useEffect(() => () => void (cascadeTimer.current && clearTimeout(cascadeTimer.current)), []);

  // Weighted drag: `useCardDrag` only tracks position, so velocity — and the
  // tilt it drives — is derived here from consecutive `drag.x` samples rather
  // than threading a change into the hook. The ghost's own CSS transition
  // (an overshoot bezier) is what makes the tilt spring toward its target
  // instead of snapping, so this effect only needs to compute where "toward"
  // is. A pointer that stops moving stops producing samples altogether, so an
  // idle timer eases the tilt back to its resting lean rather than leaving it
  // pinned at whatever the last real move happened to be — that idle-to-rest
  // spring is the "settles" half of the item, since the drop itself removes
  // the ghost before any animation on it could be seen.
  const dragMotion = useRef<{ x: number; t: number } | null>(null);
  const dragIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragTilt, setDragTilt] = useState(DRAG_BASE_TILT);

  useEffect(() => {
    if (dragIdleTimer.current) clearTimeout(dragIdleTimer.current);
    if (!drag) {
      dragMotion.current = null;
      setDragTilt(DRAG_BASE_TILT);
      return;
    }
    const now = performance.now();
    const prev = dragMotion.current;
    dragMotion.current = { x: drag.x, t: now };
    dragIdleTimer.current = setTimeout(() => setDragTilt(DRAG_BASE_TILT), 80);
    if (!prev) return;
    const dt = now - prev.t;
    if (dt <= 0) return;
    const vx = (drag.x - prev.x) / dt;
    const lean = Math.max(-DRAG_MAX_TILT, Math.min(DRAG_MAX_TILT, vx * DRAG_TILT_GAIN));
    setDragTilt(DRAG_BASE_TILT + lean);
  }, [drag]);

  useEffect(() => () => void (dragIdleTimer.current && clearTimeout(dragIdleTimer.current)), []);

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

  // The hand is already non-interactive once a run ends (HandTray's own
  // `disabled` prop), so its spot is dead space — the run-end screen takes it
  // over rather than adding a layer over the board.
  const best =
    logRows.length === 0 ? null : logRows.reduce((a, b) => (b.score > a.score ? b : a));
  const runEnd = state.status !== 'playing' && (
    <RunEndPanel
      status={state.status}
      score={state.score}
      target={cfg.targetScore}
      best={best}
      onReplay={() => g.handleNewRun(state.seed)}
    />
  );
  const trayOrEnd = playing ? handTray : runEnd;

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
                dragActive={Boolean(drag)}
                cascade={cascade}
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
                dragActive={Boolean(drag)}
                cascade={cascade}
              />
            )}

            {/* The grid board positions its own side preview against the hovered
                row; the hex board has no row to anchor to, so it sits here. */}
            {!docked && ((run.kind === 'hex' && preview) || cashPreview) && (
              <PreviewPanel preview={(cashPreview ?? preview)!} />
            )}
          </div>

          {!docked && <div className="w-full">{trayOrEnd}</div>}

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
          {trayOrEnd}
        </div>
      )}

      {scoreFly && (
        <div
          key={scoreFly.id}
          className="animate-score-fly pointer-events-none fixed z-40 font-mono text-lg font-black text-emerald-400"
          style={
            {
              left: scoreFly.x,
              top: scoreFly.y,
              '--score-fly-dx': `${scoreFly.dx}px`,
              '--score-fly-dy': `${scoreFly.dy}px`,
            } as React.CSSProperties
          }
        >
          +{scoreFly.amount}
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
            // left/top track the pointer every frame; only the rotation
            // inside `transform` is transitioned, so position never lags but
            // the lean springs toward its target with a slight overshoot.
            transform: `translate(-50%, -60%) rotate(${dragTilt}deg) scale(1.12)`,
            transition: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
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
