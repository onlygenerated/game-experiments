/**
 * Calibration probe. Not part of the game and not part of `npm test` — run it
 * with `npm run probe` when a ruleset needs its target set or its decision
 * quality measured.
 *
 * Three agents play every ruleset over the same seeds:
 *   greedy    — best move available right now
 *   careless  — samples across the move distribution
 *   2-ply     — best immediate move plus best follow-up
 *
 * The headline number is the **skill gap** (greedy / careless): how much
 * playing well is worth. The second is **lookahead lift** (2-ply / greedy):
 * whether setup plays exist at all.
 *
 * Coordinates travel as opaque string keys so grid and hex rulesets go through
 * one path. Measuring a hex ruleset with grid functions would silently produce
 * plausible, wrong numbers.
 *
 * There is no exit tile yet — that is items 4-5. Every board here is already a
 * bounded region though (a grid's edges, a hex sprawl's `hexRadius` ring), and
 * that boundary is exactly the shape a room border will have. **Reach
 * pressure** treats it as a stand-in exit: on any turn where a border cell is
 * legally reachable, does the best-scoring move actually go there, or does it
 * chase the interior instead? That is the choose-a-rich-pocket-and-ignore-the-
 * map pathology the room design exists to fix, measurable now without a real
 * exit. Once item 5 lands a real exit condition this should be revisited
 * rather than assumed still correct. **Clear rate** is named for what a room
 * clear will mean, but until item 6 adds the reach condition it is exactly
 * "final score reached target", nothing more — do not read a reach component
 * into it yet.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CONFIG, type Config } from '../src/config';
import { canCash, legalCells, scoreCross, scorePlacement } from '../src/board';
import { cashCellAt, newGame, placeCard, type GameState } from '../src/game';
import { legalHexCells, scoreHexPlacement } from '../src/hex/board';
import { newHexGame, placeHexCard, type HexGameState } from '../src/hex/game';
import { hexDistance, hexKey, ORIGIN, parseHex, type Hex } from '../src/hex/coords';
import { hashSeed, mulberry32 } from '../src/deck';
import { RULESETS } from '../src/rulesets';
import {
  currentStructure,
  legalRoomCells,
  newExpedition,
  placeInRoom,
  type ExpeditionState,
} from '../src/rooms/expedition';
import { roomEndState, roomExits, type Room } from '../src/rooms/room';
import { scoreRoomPlacement } from '../src/rooms/scoring';
import { ROOM_SHAPES } from '../src/rooms/shapes';

type AnyRun = GameState | HexGameState;

/** One structure-dispatched façade, so the agents below stay structure-blind. */
function api(cfg: Config) {
  const hex = cfg.structure === 'hex';
  return {
    start: (seed: string): AnyRun => (hex ? newHexGame(seed, cfg) : newGame(seed, cfg)),
    cells: (s: AnyRun): string[] =>
      hex
        ? legalHexCells((s as HexGameState).board, cfg).map(hexKey)
        : legalCells((s as GameState).board, cfg).map((p) => `${p.r},${p.c}`),
    /**
     * Crosses that can still be banked. Empty for every ruleset but
     * lock-and-cash, where cashing is a move like any other and has to be
     * enumerated, or the agents would build all run and score nothing.
     */
    cashes: (s: AnyRun): string[] => {
      if (hex || !cfg.mechanics.lockAndCash) return [];
      const out: string[] = [];
      for (let r = 0; r < cfg.gridSize; r++) {
        for (let c = 0; c < cfg.gridSize; c++) {
          if (canCash((s as GameState).board, r, c, cfg)) out.push(`${r},${c}`);
        }
      }
      return out;
    },
    score: (s: AnyRun, key: string, i: number) => {
      if (i === CASH) {
        const [r, c] = key.split(',').map(Number);
        return scoreCross((s as GameState).board, r, c, cfg, undefined, 'cash');
      }
      const card = s.hand[i];
      if (hex) return scoreHexPlacement((s as HexGameState).board, parseHex(key), card, cfg);
      const [r, c] = key.split(',').map(Number);
      return scorePlacement((s as GameState).board, r, c, card, cfg);
    },
    play: (s: AnyRun, i: number, key: string): AnyRun => {
      if (i === CASH) {
        const [r, c] = key.split(',').map(Number);
        return cashCellAt(s as GameState, r, c, cfg);
      }
      if (hex) return placeHexCard(s as HexGameState, i, parseHex(key), cfg);
      const [r, c] = key.split(',').map(Number);
      return placeCard(s as GameState, i, r, c, cfg);
    },
    /**
     * Steps in from the board's outer boundary — 0 on the boundary itself.
     * There is no exit tile yet, so this boundary stands in for one; see the
     * file header.
     */
    edgeDist: (key: string): number => {
      if (hex) return cfg.hexRadius - hexDistance(parseHex(key), ORIGIN);
      const [r, c] = key.split(',').map(Number);
      return Math.min(r, c, cfg.gridSize - 1 - r, cfg.gridSize - 1 - c);
    },
  };
}

/** Sentinel hand index meaning "cash the cross here" rather than "play hand[i]". */
const CASH = -1;

interface Move {
  i: number;
  key: string;
  v: number;
}

function moves(s: AnyRun, a: ReturnType<typeof api>): Move[] {
  const out: Move[] = [];
  const cells = a.cells(s);
  for (let i = 0; i < s.hand.length; i++) {
    for (const key of cells) out.push({ i, key, v: a.score(s, key, i).score });
  }
  for (const key of a.cashes(s)) out.push({ i: CASH, key, v: a.score(s, key, CASH).score });
  return out.sort((x, y) => y.v - x.v);
}

interface RunStats {
  score: number;
  placements: number;
  spreads: number[];
  minLegal: number;
  wonAt: number | null;
  /** Turns where a border cell was legally available at all. */
  reachEligible: number;
  /** Of those, turns where the best-scoring move went elsewhere. */
  reachAway: number;
}

/**
 * Runs play the full placement budget rather than stopping on a win.
 *
 * Stopping early makes scores incomparable across rulesets: a higher target
 * means a longer run and therefore a mechanically larger score and skill gap,
 * which reads as a mechanical improvement that is not there. Score only
 * accumulates, so "did the final score reach the target" is still exactly
 * equivalent to "would this run have won".
 */
function play(cfg: Config, seed: string, pick: (s: AnyRun, m: Move[]) => Move): RunStats {
  const uncapped: Config = { ...cfg, targetScore: Number.POSITIVE_INFINITY };
  const a = api(uncapped);
  let s = a.start(seed);
  let minLegal = Infinity;
  let wonAt: number | null = null;
  const spreads: number[] = [];
  let reachEligible = 0;
  let reachAway = 0;
  let turn = 0;

  while (s.status === 'playing') {
    const m = moves(s, a);
    if (!m.length) break;
    turn++;
    // Every board opens with a lone anchor and a handful of legal cells, so
    // only measure crowding — and reach — once there is a structure to be
    // crowded by, matching minLegal's gate below.
    if (turn > 5) {
      minLegal = Math.min(minLegal, a.cells(s).length);
      if (m.some((mv) => a.edgeDist(mv.key) === 0)) {
        reachEligible++;
        if (a.edgeDist(m[0].key) !== 0) reachAway++;
      }
    }
    const median = m[Math.floor(m.length / 2)].v || 1;
    spreads.push(m[0].v / median);

    const chosen = pick(s, m);
    s = a.play(s, chosen.i, chosen.key);
    if (wonAt === null && s.score >= cfg.targetScore) wonAt = turn;
  }
  return {
    score: s.score,
    reachEligible,
    reachAway,
    placements: s.log.length,
    spreads,
    minLegal: Number.isFinite(minLegal) ? minLegal : 0,
    wonAt,
  };
}

const greedy = <S>(_s: S, m: Move[]) => m[0];

/**
 * The floor: a player who makes legal moves without looking at their value.
 *
 * Seeded per run, so it is reproducible and independent of `rulesets.ts`.
 * This used to be a fixed stride over the value-sorted move list, driven by a
 * counter held in module state, which was wrong twice over: the counter
 * carried from one ruleset to the next, so inserting a ruleset silently
 * changed the baseline of every ruleset after it, and a stride over a sorted
 * list means something different depending on how long the list is. Uniform
 * random play is the baseline the skill gap is supposed to be measured
 * against, and it means the same thing everywhere.
 */
const carelessAgent = (seed: string) => {
  const rng = mulberry32(hashSeed(`${seed}:careless`));
  return <S>(_s: S, m: Move[]) => m[Math.floor(rng() * m.length)];
};

function lookahead(cfg: Config) {
  const a = api({ ...cfg, targetScore: Number.POSITIVE_INFINITY });
  return (s: AnyRun, m: Move[]): Move => {
    let best = m[0];
    let bestV = -1;
    for (const mv of m.slice(0, 12)) {
      const next = a.play(s, mv.i, mv.key);
      const follow = next.status === 'playing' ? (moves(next, a)[0]?.v ?? 0) : 0;
      if (mv.v + follow > bestV) {
        bestV = mv.v + follow;
        best = mv;
      }
    }
    return best;
  };
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0;
};

const SEEDS = 20;

it('ruleset comparison', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => `probe-${i}`);
  const rows = [
    ['ruleset', 'target', 'greedy', 'careless', 'skill', '2ply', 'lift', 'reach%', 'spread', 'minCells', 'clear%'].join('\t'),
  ];
  const measured: Record<string, number | string | null>[] = [];

  for (const rs of RULESETS) {
    const cfg = rs.config;
    const g = seeds.map((s) => play(cfg, s, greedy));
    const c = seeds.map((s) => play(cfg, s, carelessAgent(s)));
    const l = seeds.map((s) => play(cfg, s, lookahead(cfg)));

    const gm = median(g.map((x) => x.score));
    const cm = median(c.map((x) => x.score));
    const lm = median(l.map((x) => x.score));
    const wins = g.filter((x) => x.wonAt !== null);

    const eligible = g.reduce((a, x) => a + x.reachEligible, 0);
    const away = g.reduce((a, x) => a + x.reachAway, 0);
    // Null, not 0%, when a border cell was never legally reachable: on such a
    // ruleset the question "does play chase the interior" has no answer.
    const reachPct = eligible > 0 ? Math.round((100 * away) / eligible) : null;

    measured.push({
      id: rs.id,
      target: cfg.targetScore,
      greedy: gm,
      careless: cm,
      // Null rather than a huge number: where random play scores zero the
      // ratio is not a measurement of anything.
      skill: cm > 0 ? Number((gm / cm).toFixed(2)) : null,
      twoPly: lm,
      lift: Number((lm / Math.max(gm, 1)).toFixed(2)),
      reachPct,
      spread: Number(median(g.flatMap((x) => x.spreads)).toFixed(1)),
      minCells: median(g.map((x) => x.minLegal)),
      clearPct: Math.round((100 * wins.length) / g.length),
    });

    rows.push(
      [
        rs.id.padEnd(24),
        cfg.targetScore,
        gm,
        cm,
        cm > 0 ? (gm / cm).toFixed(2) : '--',
        lm,
        (lm / Math.max(gm, 1)).toFixed(2),
        reachPct === null ? '--' : reachPct + '%',
        median(g.flatMap((x) => x.spreads)).toFixed(1),
        median(g.map((x) => x.minLegal)),
        Math.round((100 * wins.length) / g.length) + '%',
      ].join('\t'),
    );
  }
  console.log('\n' + rows.join('\n'));
  writeMetrics(measured);
});

/**
 * Item 13b: the room façade. An agent still sees `Move[]` and returns one —
 * `roomMoves` builds the same shape `moves()` does above, just off
 * `ExpeditionState`/`legalRoomCells` instead of a grid or hex board's own
 * legality. `greedy`/`carelessAgent` (now generic in the state type) are
 * reused unchanged; `roomLookahead` mirrors `lookahead` for the one thing
 * that can't be shared — evaluating a follow-up move needs the room's own
 * `play`.
 *
 * A run is one room over its placement budget, per the item's own text —
 * there is no attempt to leave through an exit here (that would need an
 * agent that *wants* to, which is item 13c). `roomEndState` is read once, at
 * the end of the budget, off whatever the board ended up as; reach and score
 * are both monotone non-decreasing over a room (cards are never removed and
 * no tile effect ever reduces a placement's score below zero), so reading it
 * once at the end is equivalent to reading it after every placement and
 * keeping the best.
 */
function roomApi(room: Room, cfg: Config) {
  return {
    start: (seed: string): ExpeditionState => newExpedition(seed, [room], cfg),
    cells: (s: ExpeditionState): string[] => legalRoomCells(s, cfg).map(hexKey),
    score: (s: ExpeditionState, key: string, i: number) =>
      scoreRoomPlacement(s.board, parseHex(key), s.hand[i], room.tiles, cfg),
    play: (s: ExpeditionState, i: number, key: string): ExpeditionState =>
      placeInRoom(s, i, parseHex(key), cfg),
  };
}

function roomMoves(s: ExpeditionState, a: ReturnType<typeof roomApi>): Move[] {
  const out: Move[] = [];
  const cells = a.cells(s);
  for (let i = 0; i < s.hand.length; i++) {
    for (const key of cells) out.push({ i, key, v: a.score(s, key, i).score });
  }
  return out.sort((x, y) => y.v - x.v);
}

function roomLookahead(room: Room, cfg: Config) {
  const a = roomApi(room, cfg);
  return (s: ExpeditionState, m: Move[]): Move => {
    let best = m[0];
    let bestV = -1;
    for (const mv of m.slice(0, 12)) {
      const next = a.play(s, mv.i, mv.key);
      const follow = next.status === 'playing' ? (roomMoves(next, a)[0]?.v ?? 0) : 0;
      if (mv.v + follow > bestV) {
        bestV = mv.v + follow;
        best = mv;
      }
    }
    return best;
  };
}

/**
 * Item 13c: every agent above (`greedy`, `carelessAgent`, `lookahead`/
 * `roomLookahead`) picks by score alone, so a room's `clear%` in 13b's table
 * measures whichever exit a score-blind walk happens to stumble into, not
 * whether the reach condition changes anything. `goalSeekingAgent` is the
 * simplest agent that can tell the difference: it values a move's own score
 * *and* how much closer that move brings the structure to the nearest exit,
 * `v + w * reduction`, per the item's own formula.
 *
 * "Distance from the structure to the nearest exit" is `nearestExitDist`
 * below: the minimum hex distance from any occupied cell to any exit,
 * straight-line rather than a real path — the item calls for "the simplest
 * form", and a room this small (17-19 cells) rarely has a blocked route long
 * enough for the difference from a true shortest-path search to matter.
 * `reduction` is that distance *before* this placement minus the distance
 * *after* it (i.e. with the candidate cell folded into the structure) — since
 * a structure only ever grows and the distance is a min over an expanding
 * set, `after <= before` always, so `reduction` is never negative and a move
 * that doesn't get any closer simply scores `v + 0`.
 *
 * One edge case worth being explicit about: an empty structure (before the
 * first placement of a room) has no "distance to reduce" yet — there's
 * nothing on the board to measure from. Treated as `reduction = 0` for every
 * candidate on that first turn rather than, say, `Infinity`, which would make
 * the agent chase the exit blindly on turn one regardless of `w` and ignore
 * score entirely — the opposite of what a *weighted* trade-off is supposed to
 * express.
 */
function nearestExitDist(cells: Iterable<string>, exits: readonly Hex[]): number {
  let best = Infinity;
  for (const key of cells) {
    const h = parseHex(key);
    for (const e of exits) best = Math.min(best, hexDistance(h, e));
  }
  return best;
}

function goalSeekingAgent(room: Room, w: number) {
  const exits = roomExits(room);
  return (s: ExpeditionState, m: Move[]): Move => {
    const structure = currentStructure(s);
    const before = structure.size === 0 ? null : nearestExitDist(structure, exits);
    let best = m[0];
    let bestV = -Infinity;
    for (const mv of m) {
      const after = nearestExitDist([...structure, mv.key], exits);
      const reduction = before === null ? 0 : before - after;
      const v = mv.v + w * reduction;
      if (v > bestV) {
        bestV = v;
        best = mv;
      }
    }
    return best;
  };
}

interface RoomRunStats {
  score: number;
  spreads: number[];
  minLegal: number;
  reached: boolean;
  scoreMet: boolean;
  cleared: boolean;
}

/**
 * Plays exactly one room, stopping when the placement budget runs out (or
 * sooner, if the hand or the room's legal cells run dry first — mirroring
 * `play()`'s own `!m.length` guard above). `placeInRoom` itself would also
 * stop advancing once `placementsLeft` hits zero (a silent no-op past that
 * point), but the loop's own `s.placementsLeft > 0` guard is what actually
 * terminates it — without it, a cleared room never flips its `status` away
 * from `'playing'` (only `leaveRoom` does that, and nothing here calls it),
 * so the loop would spin forever re-picking the same no-op move.
 */
function playRoom(
  room: Room,
  cfg: Config,
  seed: string,
  pick: (s: ExpeditionState, m: Move[]) => Move,
): RoomRunStats {
  const a = roomApi(room, cfg);
  let s = a.start(seed);
  let minLegal = Infinity;
  const spreads: number[] = [];
  let turn = 0;

  while (s.status === 'playing' && s.placementsLeft > 0) {
    const m = roomMoves(s, a);
    if (!m.length) break;
    turn++;
    // Same turn>5 gate as `play()` above, for the same reason: the opening
    // placements are noise before there is a structure to be crowded by.
    if (turn > 5) minLegal = Math.min(minLegal, a.cells(s).length);
    const med = m[Math.floor(m.length / 2)].v || 1;
    spreads.push(m[0].v / med);

    const chosen = pick(s, m);
    s = a.play(s, chosen.i, chosen.key);
  }

  const end = roomEndState(room, currentStructure(s), s.score);
  return {
    score: s.score,
    spreads,
    minLegal: Number.isFinite(minLegal) ? minLegal : 0,
    reached: end.reached,
    scoreMet: end.scoreMet,
    cleared: end.cleared,
  };
}

/**
 * A separate table, not new columns bolted onto `ruleset comparison`'s own —
 * the item's "leave the existing grid/hex rows byte-identical" is easiest to
 * honour by never touching that table's header or row-building code at all.
 * `reached%` and `clear%` are the "two columns" the item asks for (reach and
 * the reach-and-score conjunction, so a near-miss reads as "got there but
 * short" the way `roomEndState` itself reports it) — deliberately not named
 * `reach%`, which keeps its existing edge-based meaning for the grid/hex
 * table above and would be a wrong answer to a different question here.
 *
 * Does not call `writeMetrics` — `RulesetMetrics`/`metrics.generated.ts` are
 * keyed by ruleset id and read by the existing Metrics page; wiring room
 * numbers into that shape is item 23's job ("rebuild the Metrics page
 * around clear rate, reach pressure and spread"), not this one's.
 */
/**
 * Item 13c: sweep `w` — the weight on getting closer to an exit, relative to
 * a move's own score — over a few values per room, so the choice used by the
 * comparison table below is measured rather than guessed. `w=0` is greedy
 * itself (the reduction term drops out entirely), included as the sweep's
 * own baseline row rather than trusted to match the `greedy` column in
 * 'room comparison' by construction alone.
 */
const W_SWEEP = [0, 1, 3, 10, 30];

it('goal-seeking weight sweep', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => `probe-goal-${i}`);
  const rows = [['room', 'w', 'score', 'reached%', 'clear%'].join('\t')];

  for (const room of ROOM_SHAPES) {
    for (const w of W_SWEEP) {
      const runs = seeds.map((s) => playRoom(room, CONFIG, s, goalSeekingAgent(room, w)));
      const sm = median(runs.map((x) => x.score));
      const reachedPct = Math.round((100 * runs.filter((x) => x.reached).length) / runs.length);
      const clearPct = Math.round((100 * runs.filter((x) => x.cleared).length) / runs.length);
      rows.push([room.name.padEnd(16), w, sm, reachedPct + '%', clearPct + '%'].join('\t'));
    }
  }
  console.log('\n' + rows.join('\n'));
});

/**
 * The weight the sweep above picked. Every value in `W_SWEEP` produced the
 * same 100% clear% on both hand-authored rooms, with median score barely
 * moving (Round Room: 1014-1024 across all five weights; Hourglass: 953,
 * unchanged to the point of not being affected by `w` at all) — the ceiling
 * effect the decisions log explains: at threshold 50, on a 17-19 cell room,
 * with a 12-placement budget, a purely score-driven walk already occupies an
 * exit almost by construction, so there is no headroom left for "wants to
 * leave" to improve on. With no value distinguishable on the metric that
 * matters, `w=10` is picked on a secondary ground: it's large enough to
 * matter once item 22 sets a real (non-trivial) threshold — the gap between
 * `reduction`'s typical range (0-4, a room this size) and a placement's own
 * score (hundreds) means `w=1` would be swamped by score noise — while still
 * not being so large (`w=30`) that it would start overriding sensible score
 * choices once ties actually exist to break. This is a bet about item 22's
 * rooms, not a measurement of these ones; revisit once thresholds are real.
 */
const CHOSEN_W = 10;

it('room comparison', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => `probe-room-${i}`);
  const rows = [
    [
      'room',
      'threshold',
      'greedy',
      'careless',
      'skill',
      '2ply',
      'lift',
      'reached%',
      'spread',
      'minCells',
      'clear%',
      'goalClear%',
      'gap',
    ].join('\t'),
  ];

  for (const room of ROOM_SHAPES) {
    const g = seeds.map((s) => playRoom(room, CONFIG, s, greedy));
    const c = seeds.map((s) => playRoom(room, CONFIG, s, carelessAgent(s)));
    const l = seeds.map((s) => playRoom(room, CONFIG, s, roomLookahead(room, CONFIG)));
    // Item 13c: same seeds, same room, the one difference is that this agent
    // also values getting closer to an exit (CHOSEN_W, picked from the sweep
    // above). The gap against `clear%` (greedy, score-only) is the item's
    // own finding — how much the reach condition changes outcomes when
    // something actually tries to use it, not just stumbles into it.
    const gs = seeds.map((s) => playRoom(room, CONFIG, s, goalSeekingAgent(room, CHOSEN_W)));

    const gm = median(g.map((x) => x.score));
    const cm = median(c.map((x) => x.score));
    const lm = median(l.map((x) => x.score));

    const reachedPct = Math.round((100 * g.filter((x) => x.reached).length) / g.length);
    const clearPct = Math.round((100 * g.filter((x) => x.cleared).length) / g.length);
    const goalClearPct = Math.round((100 * gs.filter((x) => x.cleared).length) / gs.length);

    rows.push(
      [
        room.name.padEnd(16),
        room.threshold,
        gm,
        cm,
        cm > 0 ? (gm / cm).toFixed(2) : '--',
        lm,
        (lm / Math.max(gm, 1)).toFixed(2),
        reachedPct + '%',
        median(g.flatMap((x) => x.spreads)).toFixed(1),
        median(g.map((x) => x.minLegal)),
        clearPct + '%',
        goalClearPct + '%',
        goalClearPct - clearPct,
      ].join('\t'),
    );
  }
  console.log('\n' + rows.join('\n'));
});

/**
 * Emit the numbers the in-app Metrics page reads.
 *
 * Generated rather than transcribed on purpose: a hand-copied table drifts
 * silently the moment a ruleset is retuned, and a metrics page showing stale
 * numbers is worse than no metrics page at all.
 */
function writeMetrics(measured: Record<string, number | string | null>[]) {
  const body = measured
    .map((m) => '  ' + JSON.stringify(m).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\S)/g, ', '))
    .join(',\n');

  writeFileSync(
    new URL('../src/metrics.generated.ts', import.meta.url),
    `/**
 * GENERATED by \`npm run probe\` — do not edit by hand.
 *
 * Medians over ${SEEDS} seeds, each run playing its full placement budget
 * rather than stopping on a win, so scores stay comparable across rulesets.
 */

export interface RulesetMetrics {
  id: string;
  target: number;
  /** Median final score for the best-move-now agent. */
  greedy: number;
  /** Median for an agent picking a mid-quality move each turn. */
  careless: number;
  /** greedy / careless — how much playing well is worth. Null when random play scores 0. */
  skill: number | null;
  twoPly: number;
  /** twoPly / greedy — how much planning one move ahead is worth. */
  lift: number;
  /**
   * Of the turns (after turn 5) where a boundary cell was legally reachable,
   * the share where the best-scoring move went elsewhere instead. There is no
   * exit tile yet, so the board's own edge stands in for one — see the file
   * header. Null when a boundary cell was never reachable.
   */
  reachPct: number | null;
  /** Best move / median move on a turn. High means one move screams at you. */
  spread: number;
  /** Fewest legal cells seen after turn 5. */
  minCells: number;
  /** Share of runs whose final score reached the target. Not yet gated on
   * reach — item 6 folds that in once an exit condition exists. */
  clearPct: number;
}

export const METRICS_SEEDS = ${SEEDS};
export const METRICS_GENERATED = '${new Date().toISOString().slice(0, 10)}';

export const METRICS: RulesetMetrics[] = [
${body},
];
`,
  );
}
