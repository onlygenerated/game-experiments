import { CONFIG, type Config } from './config';
import { draw, shuffledDeck, type Card } from './deck';
import type { Lens, ScoredPlacement } from './lens';

export type RunStatus = 'playing' | 'won' | 'lost';

/** What every structure's placement score has to carry, on top of the lens output. */
export interface Placed<TCoord> extends ScoredPlacement {
  at: TCoord;
}

export type LogEntry<TCoord, TScore extends Placed<TCoord>> = TScore & {
  /** 1-based placement number. */
  n: number;
  totalAfter: number;
};

export interface EngineState<TBoard, TCoord, TScore extends Placed<TCoord>> {
  seed: string;
  deck: Card[];
  hand: Card[];
  board: TBoard;
  score: number;
  placementsLeft: number;
  discardsLeft: number;
  log: LogEntry<TCoord, TScore>[];
  status: RunStatus;
}

/**
 * The six calls a board topology has to supply. `game.ts` and `hex/game.ts`
 * each wrap their own `board.ts` into one of these; the run orchestration
 * below — deal, place, discard, settle — is identical either way and lives
 * here exactly once.
 */
export interface Structure<TBoard, TCoord, TScore extends Placed<TCoord>> {
  empty(cfg: Config): TBoard;
  /** Where the opening card lands when `startWithAnchor` is on. */
  anchor(cfg: Config): TCoord;
  isLegal(board: TBoard, coord: TCoord, cfg: Config): boolean;
  legalCells(board: TBoard, cfg: Config): TCoord[];
  withCard(board: TBoard, coord: TCoord, card: Card, cfg: Config): TBoard;
  scorePlacement(board: TBoard, coord: TCoord, card: Card, cfg: Config, lens?: Lens): TScore;
}

export function createEngine<TBoard, TCoord, TScore extends Placed<TCoord>>(
  structure: Structure<TBoard, TCoord, TScore>,
) {
  type State = EngineState<TBoard, TCoord, TScore>;

  function settle(state: State, cfg: Config): State {
    if (state.score >= cfg.targetScore) return { ...state, status: 'won' };
    // The run is over when there is nothing left to do: no placements, no
    // cards, or no legal cell anywhere on the board.
    const stuck =
      state.placementsLeft <= 0 ||
      state.hand.length === 0 ||
      structure.legalCells(state.board, cfg).length === 0;
    return stuck ? { ...state, status: 'lost' } : state;
  }

  function newGame(seed: string, cfg: Config = CONFIG): State {
    const shuffled = shuffledDeck(seed);

    // Without an anchor the opening card is never drawn, so it stays in the
    // deck rather than being burned — the seed still produces a comparable run.
    let board = structure.empty(cfg);
    let remaining = shuffled;
    if (cfg.startWithAnchor) {
      const { drawn, deck: afterAnchor } = draw(shuffled, 1);
      board = structure.withCard(board, structure.anchor(cfg), drawn[0], cfg);
      remaining = afterAnchor;
    }

    const { drawn: hand, deck } = draw(remaining, cfg.handSize);

    return settle(
      {
        seed,
        deck,
        hand,
        board,
        score: 0,
        placementsLeft: cfg.placementsPerRun,
        discardsLeft: cfg.discardsPerRun,
        log: [],
        status: 'playing',
      },
      cfg,
    );
  }

  /**
   * Place hand[handIndex] at `coord`. Returns the state unchanged if the move
   * is not legal, so the UI never has to guard twice.
   */
  function placeCard(state: State, handIndex: number, coord: TCoord, cfg: Config = CONFIG): State {
    if (state.status !== 'playing') return state;
    if (state.placementsLeft <= 0) return state;

    const card = state.hand[handIndex];
    if (!card) return state;
    if (!structure.isLegal(state.board, coord, cfg)) return state;

    const result = structure.scorePlacement(state.board, coord, card, cfg);
    const board = structure.withCard(state.board, coord, card, cfg);
    const score = state.score + result.score;

    const remainingHand = state.hand.filter((_, i) => i !== handIndex);
    const { drawn, deck } = draw(state.deck, cfg.handSize - remainingHand.length);

    return settle(
      {
        ...state,
        board,
        score,
        hand: [...remainingHand, ...drawn],
        deck,
        placementsLeft: state.placementsLeft - 1,
        log: [...state.log, { ...result, n: state.log.length + 1, totalAfter: score }],
      },
      cfg,
    );
  }

  /** Discard 1..maxDiscardSelection cards and refill. Costs a charge, not a placement. */
  function discardCards(state: State, handIndices: readonly number[], cfg: Config = CONFIG): State {
    if (state.status !== 'playing') return state;
    if (state.discardsLeft <= 0) return state;

    const unique = [...new Set(handIndices)].filter((i) => i >= 0 && i < state.hand.length);
    if (unique.length < cfg.minDiscardSelection) return state;
    if (unique.length > cfg.maxDiscardSelection) return state;

    const toss = new Set(unique);
    const remainingHand = state.hand.filter((_, i) => !toss.has(i));
    const { drawn, deck } = draw(state.deck, cfg.handSize - remainingHand.length);

    return settle(
      {
        ...state,
        hand: [...remainingHand, ...drawn],
        deck,
        discardsLeft: state.discardsLeft - 1,
      },
      cfg,
    );
  }

  // `settle` is exported so a structure can add an action of its own — the grid
  // adds cashing — without reimplementing the run-over rules.
  return { newGame, placeCard, discardCards, settle };
}
