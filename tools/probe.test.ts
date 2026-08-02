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
import { it } from 'vitest';
import type { Config } from '../src/config';
import { legalCells, scorePlacement } from '../src/board';
import { newGame, placeCard, type GameState } from '../src/game';
import { legalHexCells, scoreHexPlacement } from '../src/hex/board';
import { newHexGame, placeHexCard, type HexGameState } from '../src/hex/game';
import { hexKey, parseHex } from '../src/hex/coords';
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
    score: (s: AnyRun, key: string, i: number) => {
      const card = s.hand[i];
      if (hex) return scoreHexPlacement((s as HexGameState).board, parseHex(key), card, cfg);
      const [r, c] = key.split(',').map(Number);
      return scorePlacement((s as GameState).board, r, c, card, cfg);
    },
    play: (s: AnyRun, i: number, key: string): AnyRun => {
      if (hex) return placeHexCard(s as HexGameState, i, parseHex(key), cfg);
      const [r, c] = key.split(',').map(Number);
      return placeCard(s as GameState, i, r, c, cfg);
    },
  };
}

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

let carelessTick = 0;
const careless = (_s: AnyRun, m: Move[]) => m[(carelessTick++ * 7) % m.length];

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

it('ruleset comparison', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => `probe-${i}`);
  const rows = [
    ['ruleset', 'target', 'greedy', 'careless', 'skill', '2ply', 'lift', 'mult%', 'spread', 'minCells', 'win%'].join('\t'),
  ];

  for (const rs of RULESETS) {
    const cfg = rs.config;
    const g = seeds.map((s) => play(cfg, s, greedy));
    const c = seeds.map((s) => play(cfg, s, careless));
    const l = seeds.map((s) => play(cfg, s, lookahead(cfg)));

    const gm = median(g.map((x) => x.score));
    const cm = median(c.map((x) => x.score));
    const lm = median(l.map((x) => x.score));
    const wins = g.filter((x) => x.wonAt !== null);

    rows.push(
      [
        rs.id.padEnd(24),
        cfg.targetScore,
        gm,
        cm,
        (gm / Math.max(cm, 1)).toFixed(2),
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
});
