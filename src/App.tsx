import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Config } from './config';
import { canCash, isLegalPlacement, scoreCross, scorePlacement, type PlacementScore } from './board';
import { cashCellAt, discardCards, newGame, placeCard, type GameState } from './game';
import {
  isLegalHexPlacement,
  scoreHexPlacement,
  type HexPlacementScore,
} from './hex/board';
import { discardHexCards, newHexGame, placeHexCard, type HexGameState } from './hex/game';
import { parseHex, type Hex } from './hex/coords';
import { DEFAULT_RULESET, getRuleset } from './rulesets';
import { getLens, type ScoredPlacement } from './lens';
import { RulesetMenu } from './components/RulesetMenu';
import { MetricsPage } from './components/MetricsPage';
import type { Card } from './deck';
import { TOUCH_QUERY, useMediaQuery, WIDE_QUERY } from './useMediaQuery';
import { useCardDrag } from './useCardDrag';
import { BoardGrid } from './components/BoardGrid';
import { HexBoardView } from './components/HexBoardView';
import { CardFace } from './components/CardFace';
import { DevControls } from './components/DevControls';
import { HandTray } from './components/HandTray';
import { PreviewPanel } from './components/PreviewPanel';
import { ScoreLog, type LogRow } from './components/ScoreLog';
import { StatusBar } from './components/StatusBar';

const DEFAULT_SEED = 'grid-poker-1';
const DISCARD_MS = 420;
const DEAL_MS = 520;

/**
 * A run is one structure or the other. Coordinates travel through the UI as
 * opaque string keys — "r,c" on a grid, "q,r" on hexes — so drag, preview,
 * targeting and the whole footer stay a single code path.
 */
type Run = { kind: 'grid'; s: GameState } | { kind: 'hex'; s: HexGameState };

const startRun = (seed: string, cfg: Config): Run =>
  cfg.structure === 'hex'
    ? { kind: 'hex', s: newHexGame(seed, cfg) }
    : { kind: 'grid', s: newGame(seed, cfg) };

const parseGrid = (key: string) => {
  const [r, c] = key.split(',').map(Number);
  return { r, c };
};

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
  const [rulesetId, setRulesetId] = useState(DEFAULT_RULESET);
  const ruleset = getRuleset(rulesetId);
  const cfg = ruleset.config;

  // Undo is just a stack of whole states — every field rolls back together.
  const [history, setHistory] = useState<Run[]>(() => [
    startRun(DEFAULT_SEED, getRuleset(DEFAULT_RULESET).config),
  ]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [target, setTarget] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  const wide = useMediaQuery(WIDE_QUERY);
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

  const toggle = useCallback((i: number) => {
    // Deselecting the only card would leave nothing playable.
    if (soleCard) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, [soleCard]);

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

  const { drag, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useCardDrag<string>({
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
    if (preview || drag || !target || !cashable.has(target)) return null;
    if (run.kind !== 'grid') return null;
    const { r, c } = parseGrid(target);
    return scoreCross(run.s.board, r, c, cfg, undefined, 'cash');
  }, [preview, drag, target, cashable, run, cfg]);

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

  // --- layout ----------------------------------------------------------------

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

  function handleNewRun(seed: string) {
    setHistory([startRun(seed || DEFAULT_SEED, cfg)]);
    setSelected(new Set());
    setTarget(null);
  }

  function handleRuleset(id: string) {
    setRulesetId(id);
    setHistory([startRun(state.seed, getRuleset(id).config)]);
    setSelected(new Set());
    setTarget(null);
  }

  function handleUndo() {
    if (history.length <= 1) return;
    setHistory((h) => h.slice(0, -1));
    setSelected(new Set());
    setTarget(null);
  }

  const n = activeSelection.size;
  const hint = drag
    ? 'Drop on a highlighted cell'
    : cfg.mechanics.lockAndCash && n <= 1
      ? touch
        ? 'Tap a green cell to build, a gold card to cash'
        : 'Place to build; click a gold card to cash its cross'
      : soleCard
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
      selected={activeSelection}
      onToggle={toggle}
      soleCard={soleCard}
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

  if (showMetrics) return <MetricsPage onClose={() => setShowMetrics(false)} />;

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
          <button
            onClick={() => setDevOpen((v) => !v)}
            aria-expanded={devOpen}
            className="ml-auto shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 active:bg-neutral-800 min-[1280px]:hidden"
          >
            Dev {devOpen ? '▲' : '▼'}
          </button>
        </div>
        <div
          className={`flex flex-col gap-2 min-[1280px]:ml-auto min-[1280px]:flex-row min-[1280px]:items-center ${devOpen ? '' : 'hidden min-[1280px]:flex'}`}
        >
          <RulesetMenu current={ruleset} onSelect={handleRuleset} />
          <button
            onClick={() => setShowMetrics(true)}
            className="shrink-0 rounded border border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-300 active:bg-neutral-800 min-[1280px]:py-1 min-[1280px]:hover:bg-neutral-800"
          >
            Metrics
          </button>
          <DevControls
            seed={state.seed}
            onNewRun={handleNewRun}
            onUndo={handleUndo}
            canUndo={history.length > 1}
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
                onActivateCell={(h) => activateKey(`${h.q},${h.r}`)}
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
                onActivateCell={(cell) => activateKey(`${cell.r},${cell.c}`)}
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

      {docked && (
        <div
          ref={footerRef}
          className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-white/10 bg-[#0d1015]/95 p-2 backdrop-blur"
        >
          {shownPreview && (
            <PreviewPanel
              preview={shownPreview}
              actionLabel={cashPreview ? 'Cash' : 'Place'}
              onPlace={() => {
                if (cashPreview && target) cash(target);
                else if (activeTarget) place(drag?.handIndex ?? selectedIndex ?? -1, activeTarget);
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
    </div>
  );
}
