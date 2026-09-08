/**
 * Calibration probe. Not part of the game and not part of `npm test` — run it
 * with `npm run probe` when a ruleset needs its target set or its decision
 * quality measured.
 *
 * Four agents play every ruleset over the same seeds:
 *   greedy    — best move available right now
 *   careless  — samples across the move distribution
 *   2-ply     — best immediate move plus best follow-up
 *   deep      — beam search 3-4 moves deep (item 13d), beside 2-ply, not
 *               replacing it — see the `deep`/`deepLift` columns
 *
 * The headline number is the **skill gap** (greedy / careless): how much
 * playing well is worth. The second is **lookahead lift** (2-ply / greedy):
 * whether setup plays exist at all. **Deep lift** (deep / greedy) asks the
 * same question with more search — the two stay side by side so a reader can
 * see whether looking further ahead finds anything 2-ply missed.
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
import { METRICS } from '../src/metrics.generated';
import {
  currentStructure,
  legalRoomCells,
  newExpedition,
  placeInRoom,
  type ExpeditionState,
} from '../src/rooms/expedition';
import { roomEndState, roomExits, type Room } from '../src/rooms/room';
import { scoreRoomPlacement } from '../src/rooms/scoring';
import { ARCHETYPE_ROOMS, ROOM_SHAPES } from '../src/rooms/shapes';

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

/**
 * Item 13d: search deeper than `lookahead`'s fixed best-move-plus-one-follow-
 * up. A full-width search this deep does not fit — even a modest branching
 * factor compounds fast over 3-4 levels — so `beamPick` keeps only the best
 * `beamWidth` partial sequences alive between levels rather than expanding
 * every one of them. Shared by grid/hex (`beamSearch`) and rooms
 * (`roomBeamSearch`) below through one generic `step` façade, the same
 * pattern `api`/`roomApi` already use to keep the search itself
 * structure-blind.
 *
 * `terminal` exists because "playing" is not the same question for every
 * state: for grid/hex, `status !== 'playing'` is the whole answer, but for a
 * room, `placeInRoom` silently no-ops once `placementsLeft` hits zero while
 * `status` stays `'playing'` until `leaveRoom` is called (13b's own decisions
 * log flags exactly this). Without the extra `placementsLeft <= 0` check
 * here, a beam node past its real budget would keep "expanding" into
 * identical no-op states while `total` kept adding move values that were
 * never actually played — free, fabricated score inflating the deeper
 * levels for no real placement. Explicit rather than assumed for the same
 * reason 13b made the same call explicit: getting this backwards is a
 * measurement bug, not a crash, so nothing would flag it on its own.
 */
interface BeamNode<S> {
  state: S;
  firstMove: Move;
  total: number;
}

function beamPick<S>(
  start: S,
  m: Move[],
  depth: number,
  beamWidth: number,
  step: {
    play: (s: S, i: number, key: string) => S;
    moves: (s: S) => Move[];
    terminal: (s: S) => boolean;
  },
): Move {
  let beam: BeamNode<S>[] = m.slice(0, beamWidth).map((mv) => ({
    state: step.play(start, mv.i, mv.key),
    firstMove: mv,
    total: mv.v,
  }));
  for (let level = 1; level < depth && beam.length; level++) {
    const next: BeamNode<S>[] = [];
    for (const b of beam) {
      if (step.terminal(b.state)) {
        next.push(b);
        continue;
      }
      const nm = step.moves(b.state);
      if (!nm.length) {
        next.push(b);
        continue;
      }
      for (const mv of nm.slice(0, beamWidth)) {
        next.push({ state: step.play(b.state, mv.i, mv.key), firstMove: b.firstMove, total: b.total + mv.v });
      }
    }
    next.sort((x, y) => y.total - x.total);
    beam = next.slice(0, beamWidth);
  }
  beam.sort((x, y) => y.total - x.total);
  return beam[0]?.firstMove ?? m[0];
}

const DEEP_DEPTH = 4;
const DEEP_BEAM = 10;

function beamSearch(cfg: Config) {
  const a = api({ ...cfg, targetScore: Number.POSITIVE_INFINITY });
  return (s: AnyRun, m: Move[]): Move =>
    beamPick(s, m, DEEP_DEPTH, DEEP_BEAM, {
      play: (st, i, key) => a.play(st, i, key),
      moves: (st) => moves(st, a),
      terminal: (st) => st.status !== 'playing',
    });
}

const SEEDS = 20;

it('ruleset comparison', async () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => `probe-${i}`);
  const rows = [
    [
      'ruleset',
      'target',
      'greedy',
      'careless',
      'skill',
      '2ply',
      'lift',
      'deep',
      'deepLift',
      'reach%',
      'spread',
      'minCells',
      'clear%',
    ].join('\t'),
  ];
  const measured: Record<string, number | string | null>[] = [];

  for (const rs of RULESETS) {
    const cfg = rs.config;
    const g = seeds.map((s) => play(cfg, s, greedy));
    const c = seeds.map((s) => play(cfg, s, carelessAgent(s)));
    const l = seeds.map((s) => play(cfg, s, lookahead(cfg)));
    const d = seeds.map((s) => play(cfg, s, beamSearch(cfg)));
    // Item 13d's deep agent is expensive enough that the whole loop's
    // synchronous run time crossed vitest's worker-RPC heartbeat (a
    // different timeout from `vitest.probe.config.ts`'s own 600s
    // `testTimeout`, which this run stays well under) — this test file's
    // process exited non-zero with "[vitest-worker]: Timeout calling
    // 'onTaskUpdate'" once the block ran ~200s fully synchronously. Yielding
    // once per ruleset lets the worker answer that heartbeat without
    // changing a single computed number (seeded RNG, no wall-clock
    // dependence anywhere in `play`/`beamSearch`).
    await new Promise((resolve) => setTimeout(resolve, 0));

    const gm = median(g.map((x) => x.score));
    const cm = median(c.map((x) => x.score));
    const lm = median(l.map((x) => x.score));
    const dm = median(d.map((x) => x.score));
    const wins = g.filter((x) => x.wonAt !== null);

    const eligible = g.reduce((a, x) => a + x.reachEligible, 0);
    const away = g.reduce((a, x) => a + x.reachAway, 0);
    // Null, not 0%, when a border cell was never legally reachable: on such a
    // ruleset the question "does play chase the interior" has no answer.
    const reachPct = eligible > 0 ? Math.round((100 * away) / eligible) : null;

    // `deep`/`deepLift` are deliberately not added here: `measured` feeds
    // `writeMetrics`, which shapes `RulesetMetrics` and, through it, the
    // Metrics page — widening that shape is item 23's job ("rebuild the
    // Metrics page"), not this one's, matching 13b/13c's own precedent of
    // printing new room columns without touching `writeMetrics` at all.
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
        dm,
        (dm / Math.max(gm, 1)).toFixed(2),
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
 * Item 13d's room counterpart to `beamSearch` — same `beamPick`, the room's
 * own `roomApi`/`roomMoves` in the `step` façade. `terminal` checks
 * `placementsLeft <= 0` alongside `status`, not status alone: see the
 * comment on `beamPick` itself for why skipping that check would silently
 * inflate scores past the real placement budget.
 */
function roomBeamSearch(room: Room, cfg: Config) {
  const a = roomApi(room, cfg);
  return (s: ExpeditionState, m: Move[]): Move =>
    beamPick(s, m, DEEP_DEPTH, DEEP_BEAM, {
      play: (st, i, key) => a.play(st, i, key),
      moves: (st) => roomMoves(st, a),
      terminal: (st) => st.status !== 'playing' || st.placementsLeft <= 0,
    });
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
const W_SWEEP = [0, 1, 3, 10, 30, 100];

/**
 * Item 22: swept again, this time against every archetype (not just
 * `ROOM_SHAPES`) and each one's own real, calibrated threshold. Item 13c's
 * own sweep ran against the item-6 placeholder threshold (50) and explicitly
 * flagged itself as "a bet about item 22's rooms, not a measurement of these
 * ones; revisit once thresholds are real" — thresholds are real as of this
 * item, so this is that revisit. `w=100` was added to 13c's own five values
 * because a real threshold is hundreds of points higher than a placement's
 * `reduction` term (0-4 for a room this size) can move with `w<=30`; a wider
 * sweep is needed to tell whether *any* plausible weight changes the
 * outcome, not just confirm the same five values are still tied.
 */
it('goal-seeking weight sweep', () => {
  const seeds = Array.from({ length: SEEDS }, (_, i) => `probe-goal-${i}`);
  const rows = [['room', 'w', 'score', 'reached%', 'clear%'].join('\t')];

  for (const room of [...ROOM_SHAPES, ...ARCHETYPE_ROOMS]) {
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
 * Item 22's revisit: with real thresholds the ceiling is gone (clear% now
 * ranges 25-75% across `w`, not pinned at 100), but no single weight
 * dominates every room, and the effect is not even monotonic. Round Room
 * favours a *large* w (45% clear at w=100 vs 35% at w=0); Hourglass and
 * Cribbage Vault are completely flat across all six weights (identical score
 * and clear% at every w — in both rooms the greedy path already heads toward
 * an exit, so "reduction" never has anything to trade against); Combo Bazaar
 * is actively *hurt* by a large w (65% at w=0, falling to 35% at w=30) —
 * chasing the exit there trades away the multiplier-tile detours that drive
 * its score, the opposite of Round Room's own finding. Averaged clear%
 * across all four rooms is flat at 55% for w in {0, 3, 10} and only clearly
 * worse at w=30 (45%); nothing in the sweep makes a case for replacing
 * `w=10` with a different single number, so it stays — not because 13c's
 * original reasoning was confirmed, but because the revisit found no better
 * one-size-fits-all replacement. A per-room weight is the more honest fix
 * this data actually points to; out of this item's scope, noted for later.
 */
const CHOSEN_W = 10;

/**
 * Item 22: every hand-authored archetype, not just the two that happen to sit
 * in the default room-graph sequence (`ROOM_SHAPES`). `ARCHETYPE_ROOMS`
 * (Cribbage Vault, Combo Bazaar — item 19) differ along exactly the axes the
 * calibration pass is supposed to probe (active counters, tile density), so
 * leaving them out would calibrate half the design and call it done.
 */
const CALIBRATION_ROOMS: readonly Room[] = [...ROOM_SHAPES, ...ARCHETYPE_ROOMS];

/**
 * Item 23: the shape `writeRoomMetrics` emits, one row per calibration room
 * plus a `reference: true` row for `hex-sprawl` — the same "highlighted
 * baseline row" idea the flat table already uses for Poker Squares (see
 * `MetricsPage.tsx`'s `REFERENCE`), not a new concept. Kept as its own
 * interface rather than widening `RulesetMetrics`: a room's `threshold` and
 * `reached%`/`clear%`/`goalClear%`/`gap` describe a reach-and-score
 * conjunction that a flat ruleset simply does not have, and forcing one
 * shape to cover both would mean every flat row grows four columns that are
 * always null. The reference row leaves those four `null` for the same
 * reason: hex-sprawl has no exit and no threshold, so the question "did it
 * reach one" has no answer for it, not a false one.
 */
interface RoomMetricsRow {
  label: string;
  reference: boolean;
  threshold: number | null;
  greedy: number;
  careless: number;
  skill: number | null;
  twoPly: number;
  lift: number;
  deep: number;
  deepLift: number;
  reachedPct: number | null;
  spread: number;
  minCells: number;
  clearPct: number | null;
  goalClearPct: number | null;
  gap: number | null;
}

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
      'deep',
      'deepLift',
      'reached%',
      'spread',
      'minCells',
      'clear%',
      'goalClear%',
      'gap',
    ].join('\t'),
  ];
  const perRoom: { spread: number; lift: number; deepLift: number }[] = [];
  const measured: RoomMetricsRow[] = [];

  for (const room of CALIBRATION_ROOMS) {
    const g = seeds.map((s) => playRoom(room, CONFIG, s, greedy));
    const c = seeds.map((s) => playRoom(room, CONFIG, s, carelessAgent(s)));
    const l = seeds.map((s) => playRoom(room, CONFIG, s, roomLookahead(room, CONFIG)));
    // Item 13d: same seeds, same room, beside 2-ply rather than replacing it.
    const d = seeds.map((s) => playRoom(room, CONFIG, s, roomBeamSearch(room, CONFIG)));
    // Item 13c: same seeds, same room, the one difference is that this agent
    // also values getting closer to an exit (CHOSEN_W, picked from the sweep
    // above). The gap against `clear%` (greedy, score-only) is the item's
    // own finding — how much the reach condition changes outcomes when
    // something actually tries to use it, not just stumbles into it.
    const gs = seeds.map((s) => playRoom(room, CONFIG, s, goalSeekingAgent(room, CHOSEN_W)));

    const gm = median(g.map((x) => x.score));
    const cm = median(c.map((x) => x.score));
    const lm = median(l.map((x) => x.score));
    const dm = median(d.map((x) => x.score));

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
        dm,
        (dm / Math.max(gm, 1)).toFixed(2),
        reachedPct + '%',
        median(g.flatMap((x) => x.spreads)).toFixed(1),
        median(g.map((x) => x.minLegal)),
        clearPct + '%',
        goalClearPct + '%',
        goalClearPct - clearPct,
      ].join('\t'),
    );

    perRoom.push({
      spread: median(g.flatMap((x) => x.spreads)),
      lift: lm / Math.max(gm, 1),
      deepLift: dm / Math.max(gm, 1),
    });

    measured.push({
      label: room.name,
      reference: false,
      threshold: room.threshold,
      greedy: gm,
      careless: cm,
      skill: cm > 0 ? Number((gm / cm).toFixed(2)) : null,
      twoPly: lm,
      lift: Number((lm / Math.max(gm, 1)).toFixed(2)),
      deep: dm,
      deepLift: Number((dm / Math.max(gm, 1)).toFixed(2)),
      reachedPct,
      spread: Number(median(g.flatMap((x) => x.spreads)).toFixed(1)),
      minCells: median(g.map((x) => x.minLegal)),
      clearPct,
      goalClearPct,
      gap: goalClearPct - clearPct,
    });
  }
  console.log('\n' + rows.join('\n'));

  // Item 22's own pass/fail: does the room design actually fix the flaw it
  // was built for? `hex-sprawl`'s own baselines (spread 4.3, 2-ply lift 1.12
  // — item 3's post-additive recalibration table, the only honest baseline
  // per ROOMS.md's own warning that the pre-additive 15.5/1.26-1.43 numbers
  // are void) are fixed constants transcribed from `metrics.generated.ts`
  // rather than re-measured here, since that file is exactly the artifact
  // item 3 built for this purpose. `hex-sprawl`'s deep lift has no such
  // recorded home — item 13d deliberately kept `deep`/`deepLift` out of
  // `writeMetrics` (that's item 23's job) — so it is measured fresh here,
  // same seeds and agent `ruleset comparison` already uses for `hex-sprawl`,
  // rather than guessed or left uncompared.
  const HEX_SPRAWL_SPREAD = 4.3;
  const HEX_SPRAWL_LIFT = 1.12;
  const hexSprawlCfg = RULESETS.find((r) => r.id === 'hex-sprawl')!.config;
  const hexSeeds = Array.from({ length: SEEDS }, (_, i) => `probe-${i}`);
  const hg = hexSeeds.map((s) => play(hexSprawlCfg, s, greedy));
  const hd = hexSeeds.map((s) => play(hexSprawlCfg, s, beamSearch(hexSprawlCfg)));
  const hexSprawlGm = median(hg.map((x) => x.score));
  const hexSprawlDm = median(hd.map((x) => x.score));
  const hexSprawlDeepLift = hexSprawlDm / Math.max(hexSprawlGm, 1);

  // The four archetypes' own per-room spread/lift/deepLift, reduced to one
  // comparable figure the same way any of the individual room numbers above
  // already are a median over seeds: the median *across rooms* of each
  // room's own median. Not a pooled median over every seed of every room —
  // that would let the largest room's seed count dominate the figure for no
  // principled reason, whereas "the median room" is what "does the room
  // design fix the flaw" is actually asking about.
  const roomsSpread = median(perRoom.map((r) => r.spread));
  const roomsLift = median(perRoom.map((r) => r.lift));
  const roomsDeepLift = median(perRoom.map((r) => r.deepLift));

  const verdictRows = [
    ['metric', 'hex-sprawl', 'rooms (median of 4)', 'pass = lower/higher', 'verdict'].join('\t'),
    [
      'spread',
      HEX_SPRAWL_SPREAD,
      roomsSpread.toFixed(2),
      'lower',
      roomsSpread < HEX_SPRAWL_SPREAD ? 'PASS' : 'FAIL',
    ].join('\t'),
    [
      '2ply lift',
      HEX_SPRAWL_LIFT,
      roomsLift.toFixed(2),
      'higher',
      roomsLift > HEX_SPRAWL_LIFT ? 'PASS' : 'FAIL',
    ].join('\t'),
    [
      'deep lift',
      hexSprawlDeepLift.toFixed(2),
      roomsDeepLift.toFixed(2),
      'higher',
      roomsDeepLift > hexSprawlDeepLift ? 'PASS' : 'FAIL',
    ].join('\t'),
  ];
  console.log('\nitem 22 verdict\n' + verdictRows.join('\n'));

  // Item 23: the reference row itself. Pulled from the flat table's own
  // recorded entry (`METRICS`, item 3's artifact) rather than re-measured,
  // except `deep`/`deepLift` — item 13d deliberately never wrote those into
  // `writeMetrics` ("that's item 23's job" — see the comment there), so this
  // is the one place they get computed, same seeds and agent the flat
  // `ruleset comparison` test above uses for `hex-sprawl`.
  const hexSprawlRow = METRICS.find((m) => m.id === 'hex-sprawl')!;
  measured.push({
    label: 'Hex Sprawl (reference)',
    reference: true,
    // Null, not a number: hex-sprawl has no exit and no threshold, so "did it
    // reach one" / "did it clear" have no answer here, not a false one.
    threshold: null,
    greedy: hexSprawlGm,
    careless: hexSprawlRow.careless,
    skill: hexSprawlRow.skill,
    twoPly: hexSprawlRow.twoPly,
    lift: hexSprawlRow.lift,
    deep: hexSprawlDm,
    deepLift: Number(hexSprawlDeepLift.toFixed(2)),
    reachedPct: null,
    spread: hexSprawlRow.spread,
    minCells: hexSprawlRow.minCells,
    clearPct: null,
    goalClearPct: null,
    gap: null,
  });

  writeRoomMetrics(measured);
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

/**
 * Item 23's counterpart to `writeMetrics`, for `RoomsMetricsPage`. A separate
 * generated file rather than folding rooms into `METRICS`/`RulesetMetrics`:
 * a room's `threshold`/`reachedPct`/`clearPct`/`goalClearPct`/`gap` describe
 * a reach-and-score conjunction no flat ruleset has, and every flat row
 * growing four permanently-null columns (or every room row growing a
 * permanently-null `target`) would be worse than two small, honest shapes.
 */
function writeRoomMetrics(measured: RoomMetricsRow[]) {
  const body = measured
    .map((m) => '  ' + JSON.stringify(m).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\S)/g, ', '))
    .join(',\n');

  writeFileSync(
    new URL('../src/roomMetrics.generated.ts', import.meta.url),
    `/**
 * GENERATED by \`npm run probe\` — do not edit by hand.
 *
 * Medians over ${SEEDS} seeds, each room played over its own placement
 * budget. One row per calibration room (item 19's archetypes plus the two
 * hand-authored shapes), plus a single \`reference: true\` row for
 * \`hex-sprawl\` — the pre-Rooms baseline this design is measured against,
 * the same role Poker Squares plays in the flat table (\`metrics.generated.ts\`).
 */

export interface RoomMetricsRow {
  label: string;
  /** True for exactly one row: the hex-sprawl baseline, not a calibration room. */
  reference: boolean;
  /** Null on the reference row — hex-sprawl has no exit or threshold. */
  threshold: number | null;
  /** Median final score for the best-move-now agent. */
  greedy: number;
  /** Median for an agent picking a mid-quality move each turn. */
  careless: number;
  /** greedy / careless. Null when random play scores 0. */
  skill: number | null;
  twoPly: number;
  /** twoPly / greedy — how much planning one move ahead is worth. */
  lift: number;
  deep: number;
  /** deep / greedy — item 13d's beam search, beside 2-ply lift, not replacing it. */
  deepLift: number;
  /** Share of runs (greedy agent) whose structure reached an exit. Null on
   * the reference row: hex-sprawl has no exit to reach. */
  reachedPct: number | null;
  /** Best move / median move on a turn. Lower is better — a room's whole
   * point is to flatten this against the flat game's own farmed pockets. */
  spread: number;
  /** Fewest legal cells seen after turn 5. */
  minCells: number;
  /** Share of runs (greedy agent) that reached an exit AND met the score
   * threshold. Null on the reference row — there is no threshold to meet. */
  clearPct: number | null;
  /** Same as clearPct, but for the goal-seeking agent (item 13c) that also
   * values getting closer to an exit. Null on the reference row. */
  goalClearPct: number | null;
  /** goalClearPct - clearPct — how much the reach condition changes outcomes
   * once something actually tries to use it. Null on the reference row. */
  gap: number | null;
}

export const ROOM_METRICS_SEEDS = ${SEEDS};
export const ROOM_METRICS_GENERATED = '${new Date().toISOString().slice(0, 10)}';

export const ROOM_METRICS: RoomMetricsRow[] = [
${body},
];
`,
  );
}
