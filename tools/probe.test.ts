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
 */
import { it } from 'vitest';
import type { Config } from '../src/config';
import { legalCells, scorePlacement } from '../src/board';
import { newGame, placeCard, type GameState } from '../src/game';
import { RULESETS } from '../src/rulesets';

interface Move {
  i: number;
  r: number;
  c: number;
  v: number;
}

function moves(s: GameState, cfg: Config): Move[] {
  const out: Move[] = [];
  const cells = legalCells(s.board, cfg);
  for (let i = 0; i < s.hand.length; i++) {
    for (const cell of cells) {
      out.push({
        i,
        r: cell.r,
        c: cell.c,
        v: scorePlacement(s.board, cell.r, cell.c, s.hand[i], cfg).score,
      });
    }
  }
  return out.sort((a, b) => b.v - a.v);
}

interface RunStats {
  score: number;
  multActive: number;
  placements: number;
  spreads: number[];
  /** Fewest legal cells seen once the board has had a chance to grow. */
  minLegal: number;
  /** Placement number at which the real target was crossed, if ever. */
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
function play(cfg: Config, seed: string, pick: (s: GameState, m: Move[]) => Move): RunStats {
  const uncapped: Config = { ...cfg, targetScore: Number.POSITIVE_INFINITY };
  let s = newGame(seed, uncapped);
  let multActive = 0;
  let minLegal = Infinity;
  let wonAt: number | null = null;
  const spreads: number[] = [];
  let turn = 0;

  while (s.status === 'playing') {
    const m = moves(s, uncapped);
    if (!m.length) break;
    turn++;
    // Every board starts with a lone anchor and exactly four legal cells, so
    // only measure crowding once there is a structure to be crowded by.
    if (turn > 5) minLegal = Math.min(minLegal, legalCells(s.board, uncapped).length);
    // How much better is the best move than a typical one? Near 1 = no choice.
    const median = m[Math.floor(m.length / 2)].v || 1;
    spreads.push(m[0].v / median);

    const chosen = pick(s, m);
    if (scorePlacement(s.board, chosen.r, chosen.c, s.hand[chosen.i], uncapped).mult > 1) {
      multActive++;
    }
    s = placeCard(s, chosen.i, chosen.r, chosen.c, uncapped);
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

const greedy = (_s: GameState, m: Move[]) => m[0];

let carelessTick = 0;
const careless = (_s: GameState, m: Move[]) => m[(carelessTick++ * 7) % m.length];

function lookahead(cfg: Config) {
  return (s: GameState, m: Move[]): Move => {
    let best = m[0];
    let bestV = -1;
    for (const mv of m.slice(0, 12)) {
      const next = placeCard(s, mv.i, mv.r, mv.c, cfg);
      const follow = next.status === 'playing' ? (moves(next, cfg)[0]?.v ?? 0) : 0;
      if (mv.v + follow > bestV) {
        bestV = mv.v + follow;
        best = mv;
      }
    }
    return best;
  };
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

it('ruleset comparison', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => `probe-${i}`);
  const rows = [
    ['ruleset', 'target', 'greedy', 'careless', 'skill', '2ply', 'lift', 'mult%', 'spread', 'minCells', 'wonAt', 'win%'].join('\t'),
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
        wins.length ? median(wins.map((x) => x.wonAt as number)) : '—',
        Math.round((100 * wins.length) / g.length) + '%',
      ].join('\t'),
    );
  }
  console.log('\n' + rows.join('\n'));
});
