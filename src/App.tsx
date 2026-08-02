import { useMemo, useState } from 'react';
import { CONFIG } from './config';
import { isLegalPlacement, scorePlacement, type Coord } from './board';
import { discardCards, newGame, placeCard, type GameState } from './game';
import { BoardGrid } from './components/BoardGrid';
import { DevControls } from './components/DevControls';
import { HandTray } from './components/HandTray';
import { ScoreLog } from './components/ScoreLog';
import { StatusBar } from './components/StatusBar';

const DEFAULT_SEED = 'grid-poker-1';

export default function App() {
  // Undo is just a stack of whole states — every field rolls back together.
  const [history, setHistory] = useState<GameState[]>(() => [newGame(DEFAULT_SEED)]);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [hovered, setHovered] = useState<Coord | null>(null);

  const state = history[history.length - 1];
  const playing = state.status === 'playing';

  const selectedIndex = selected.size === 1 ? [...selected][0] : null;
  const selectedCard = selectedIndex === null ? null : (state.hand[selectedIndex] ?? null);

  const preview = useMemo(() => {
    if (!playing || !selectedCard || !hovered) return null;
    if (!isLegalPlacement(state.board, hovered.r, hovered.c)) return null;
    return scorePlacement(state.board, hovered.r, hovered.c, selectedCard);
  }, [playing, selectedCard, hovered, state.board]);

  function push(next: GameState) {
    if (next === state) return;
    setHistory((h) => [...h, next]);
    setSelected(new Set());
    setHovered(null);
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
    setHovered(null);
  }

  function handleUndo() {
    if (history.length <= 1) return;
    setHistory((h) => h.slice(0, -1));
    setSelected(new Set());
    setHovered(null);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight">
          Grid Poker <span className="text-neutral-500">prototype</span>
        </h1>
        <span className="text-[11px] text-neutral-500">
          row → chips · col → mult · {CONFIG.lineCap}-card line cap
          {CONFIG.partialHands.enabled && ' · partials ON'}
        </span>
        <div className="ml-auto">
          <DevControls
            seed={state.seed}
            onNewRun={handleNewRun}
            onUndo={handleUndo}
            canUndo={history.length > 1}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-4">
        <section className="flex flex-col gap-3">
          <BoardGrid
            board={state.board}
            selectedCard={selectedCard}
            hovered={hovered}
            preview={preview}
            onHoverCell={setHovered}
            onPlace={(cell) => {
              if (selectedIndex === null) return;
              push(placeCard(state, selectedIndex, cell.r, cell.c));
            }}
            interactive={playing}
          />

          <HandTray
            hand={state.hand}
            selected={selected}
            onToggle={toggle}
            onDiscard={() => push(discardCards(state, [...selected]))}
            discardsLeft={state.discardsLeft}
            disabled={!playing}
          />

          <div className="flex gap-4 text-[11px] text-neutral-500">
            <span>
              <span className="mr-1 inline-block h-2 w-4 rounded-sm align-middle" style={{ background: 'rgba(167,139,250,.65)' }} />
              row line complete
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-4 rounded-sm align-middle" style={{ background: 'rgba(244,114,182,.65)' }} />
              col line complete
            </span>
            <span className="text-sky-400">row = chips</span>
            <span className="text-amber-400">col = mult</span>
          </div>
        </section>

        <aside className="flex min-h-0 w-96 flex-col gap-3">
          <StatusBar state={state} />
          <ScoreLog log={state.log} />
        </aside>
      </main>
    </div>
  );
}
