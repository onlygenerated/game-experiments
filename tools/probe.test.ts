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
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { Config } from '../src/config';
import { canCash, legalCells, scoreCross, scorePlacement } from '../src/board';
import { cashCellAt, newGame, placeCard, type GameState } from '../src/game';
import { legalHexCells, scoreHexPlacement } from '../src/hex/board';
import { newHexGame, placeHexCard, type HexGameState } from '../src/hex/game';
import { hexKey, parseHex } from '../src/hex/coords';
import { hashSeed, mulberry32 } from '../src/deck';
import { RULESETS } from '../src/rulesets';

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
  multActive: number;
  placements: number;
  spreads: number[];
  minLegal: number;
  wonAt: number | null;
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
  let multActive = 0;
  let minLegal = Infinity;
  let wonAt: number | null = null;
  const spreads: number[] = [];
  let turn = 0;

  while (s.status === 'playing') {
    const m = moves(s, a);
    if (!m.length) break;
    turn++;
    // Every board opens with a lone anchor and a handful of legal cells, so
    // only measure crowding once there is a structure to be crowded by.
    if (turn > 5) minLegal = Math.min(minLegal, a.cells(s).length);
    const median = m[Math.floor(m.length / 2)].v || 1;
    spreads.push(m[0].v / median);

    const chosen = pick(s, m);
    if (a.score(s, chosen.key, chosen.i).mult > 1) multActive++;
    s = a.play(s, chosen.i, chosen.key);
    if (wonAt === null && s.score >= cfg.targetScore) wonAt = turn;
  }
  return {
    score: s.score,
    multActive,
    placements: s.log.length,
    spreads,
    minLegal: Number.isFinite(minLegal) ? minLegal : 0,
    wonAt,
  };
}

const greedy = (_s: AnyRun, m: Move[]) => m[0];

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
  return (_s: AnyRun, m: Move[]) => m[Math.floor(rng() * m.length)];
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
    ['ruleset', 'target', 'greedy', 'careless', 'skill', '2ply', 'lift', 'mult%', 'spread', 'minCells', 'win%'].join('\t'),
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
      multPct: Math.round(
        (100 * g.reduce((a, x) => a + x.multActive, 0)) / g.reduce((a, x) => a + x.placements, 0),
      ),
      spread: Number(median(g.flatMap((x) => x.spreads)).toFixed(1)),
      minCells: median(g.map((x) => x.minLegal)),
      winPct: Math.round((100 * wins.length) / g.length),
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
        Math.round(
          (100 * g.reduce((a, x) => a + x.multActive, 0)) / g.reduce((a, x) => a + x.placements, 0),
        ) + '%',
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
  /** Share of placements where the mult axis contributed more than x1. */
  multPct: number;
  /** Best move / median move on a turn. High means one move screams at you. */
  spread: number;
  /** Fewest legal cells seen after turn 5. */
  minCells: number;
  winPct: number;
}

export const METRICS_SEEDS = ${SEEDS};
export const METRICS_GENERATED = '${new Date().toISOString().slice(0, 10)}';

export const METRICS: RulesetMetrics[] = [
${body},
];
`,
  );
}
