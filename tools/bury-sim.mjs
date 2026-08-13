/**
 * bury-sim.mjs — headless answer to success criteria 1 and 2 of the Bury PRD.
 *
 *   node tools/bury-sim.mjs
 *   node tools/bury-sim.mjs --caps 45,50,55,60 --hands 20000
 *
 * Mirrors bury.html's rules. It exists to answer two questions in seconds
 * rather than over an evening:
 *
 *   1. Does the pip cap bind?  (how often, and at how many buries)
 *   2. Is burying ever wrong?  (is a bury strategy dominant at a given cap)
 *
 * It does NOT answer whether burying is *interesting*, which is what the
 * evening is for. A dominant strategy is a design bug; the absence of one is
 * only a precondition for the mechanic being any good.
 */

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : args[i + 1];
};

const POSITION_COUNT = 7;
const HAND_SIZE = 9;
const TIE_GOES_TO = argVal('--tie', 'ghost');
const HANDS = Number(argVal('--hands', 20000));
const GHOST_POOL = Number(argVal('--pool', 3000));
const CAPS = String(argVal('--caps', '45,50,55,60,65,70')).split(',').map(Number);
const CAP_MODE = argVal('--mode', 'both'); // flat | per-card | both

const POINTS = Array.from({ length: POSITION_COUNT }, (_, i) => i + 1);
const TOTAL_POT = POINTS.reduce((a, b) => a + b, 0);

/* --- deck ---------------------------------------------------------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Number(argVal('--seed', 20260813)));

const DECK = [];
for (let s = 0; s < 4; s++) for (let v = 2; v <= 14; v++) DECK.push(v);

function dealHand() {
  const d = DECK.slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d.slice(0, HAND_SIZE).sort((a, b) => b - a);
}

function capFor(cap, mode, playedCount) {
  return mode === 'per-card' ? Math.floor(cap / POSITION_COUNT * playedCount) : cap;
}

/* --- line construction ---------------------------------------------------
   Pick the highest-summing legal subset of `k` cards, then put the strongest
   cards on the highest-stakes positions. 9-choose-k is at most 126, so this is
   brute-forced rather than approximated.
------------------------------------------------------------------------- */
function bestSubset(hand, k, cap) {
  let best = null, bestSum = -1;
  const idx = new Array(k);
  (function choose(start, depth, sum) {
    if (sum > cap) return;
    if (depth === k) {
      if (sum > bestSum) { bestSum = sum; best = idx.slice(); }
      return;
    }
    for (let i = start; i < hand.length; i++) { idx[depth] = i; choose(i + 1, depth + 1, sum + hand[i]); }
  })(0, 0, 0);
  if (best) return best.map(i => hand[i]);
  return hand.slice(-k);                       // cheapest k — always legal in practice
}

/**
 * Build a line. `buryPositions` is a list of positions forfeited this round.
 * Returns positions[1..7] as card value or null (buried).
 */
function buildLine(hand, buryPositions, cap, mode) {
  const buried = new Set(buryPositions);
  const contested = POINTS.filter(p => !buried.has(p)).sort((a, b) => b - a); // richest first
  const k = contested.length;
  const cards = bestSubset(hand, k, capFor(cap, mode, k)).sort((a, b) => b - a);
  const line = new Array(POSITION_COUNT).fill(null);
  contested.forEach((pos, i) => { line[pos - 1] = cards[i]; });
  return line;
}

/* --- strategies ---------------------------------------------------------- */
const STRATEGIES = [
  { name: 'never bury',      buries: () => [] },
  { name: 'bury 1 (pos 1)',  buries: () => [1] },
  { name: 'bury 2 (pos 1,2)', buries: () => [1, 2] },
  { name: 'bury 2 (pos 1,3)', buries: () => [1, 3] },
];

/* --- resolution ---------------------------------------------------------- */
function scoreLine(mine, ghost) {
  let f = 0;
  for (let i = 0; i < POSITION_COUNT; i++) {
    const p = mine[i], g = ghost[i];
    let winner;
    if (p === null && g === null) winner = TIE_GOES_TO;
    else if (p === null) winner = 'ghost';
    else if (g === null) winner = 'player';
    else if (p === g) winner = TIE_GOES_TO;
    else winner = p > g ? 'player' : 'ghost';
    if (winner === 'player') f += POINTS[i];
  }
  return f;
}

/* --- does the cap bind? --------------------------------------------------
   The unconstrained line is the best-k-of-9. If its sum is under the cap, the
   constraint did nothing that hand.
------------------------------------------------------------------------- */
function bindingStats(hands) {
  const rows = [];
  for (let buries = 0; buries <= 2; buries++) {
    const k = POSITION_COUNT - buries;
    let sum = 0;
    const sums = [];
    for (const h of hands) { const s = h.slice(0, k).reduce((a, b) => a + b, 0); sum += s; sums.push(s); }
    sums.sort((a, b) => a - b);
    rows.push({ buries, k, mean: sum / hands.length, median: sums[Math.floor(sums.length / 2)], sums });
  }
  return rows;
}

/* --- run ----------------------------------------------------------------- */
const hands = Array.from({ length: HANDS }, dealHand);

console.log(`Bury simulator — ${HANDS.toLocaleString()} hands, ghost pool ${GHOST_POOL.toLocaleString()}, ties to ${TIE_GOES_TO}\n`);

console.log('Unconstrained line strength (best-k-of-9, no cap applied)');
console.log('  buries  cards  mean pips  median');
for (const r of bindingStats(hands)) {
  console.log(`  ${String(r.buries).padStart(6)}  ${String(r.k).padStart(5)}  ${r.mean.toFixed(1).padStart(9)}  ${String(r.median).padStart(6)}`);
}
console.log('  A cap above the mean is barely a constraint; well below it, the cap bites.\n');

const modes = CAP_MODE === 'both' ? ['flat', 'per-card'] : [CAP_MODE];

for (const mode of modes) {
  console.log(`\n=== cap mode: ${mode} ===`);
  for (const cap of CAPS) {

    // How often does the cap actually bind, per bury count?
    const binds = [];
    for (let b = 0; b <= 2; b++) {
      const k = POSITION_COUNT - b;
      const eff = capFor(cap, mode, k);
      let n = 0;
      for (const h of hands) if (h.slice(0, k).reduce((a, x) => a + x, 0) > eff) n++;
      binds.push({ b, eff, pct: 100 * n / hands.length });
    }

    // Ghost pool: an equal mix of every strategy, so nobody is measured
    // against a straw opponent.
    const pool = [];
    for (let i = 0; i < GHOST_POOL; i++) {
      const h = hands[Math.floor(rng() * hands.length)];
      const st = STRATEGIES[i % STRATEGIES.length];
      pool.push(buildLine(h, st.buries(), cap, mode));
    }

    const results = STRATEGIES.map(st => {
      let total = 0, wins = 0, n = 0;
      for (const h of hands) {
        const mine = buildLine(h, st.buries(), cap, mode);
        const g = pool[Math.floor(rng() * pool.length)];
        const f = scoreLine(mine, g);
        total += f; n++;
        if (f > TOTAL_POT - f) wins++;
      }
      return { name: st.name, avg: total / n, winPct: 100 * wins / n };
    });

    const best = results.reduce((a, b) => (b.avg > a.avg ? b : a));
    console.log(`\n  PIP_CAP = ${cap}`);
    console.log(`    binds:  0 buries ${binds[0].pct.toFixed(0)}% (cap ${binds[0].eff}) · ` +
                `1 bury ${binds[1].pct.toFixed(0)}% (cap ${binds[1].eff}) · ` +
                `2 buries ${binds[2].pct.toFixed(0)}% (cap ${binds[2].eff})`);
    for (const r of results) {
      const flag = r.name === best.name ? '  ← best' : '';
      console.log(`    ${r.name.padEnd(18)} ${r.avg.toFixed(2).padStart(5)} / ${TOTAL_POT} pts   ${r.winPct.toFixed(1).padStart(5)}% rounds won${flag}`);
    }
    const spread = best.avg - results.reduce((a, b) => (b.avg < a.avg ? b : a)).avg;
    if (spread > 1.5) {
      console.log(`    ⚠ spread ${spread.toFixed(2)} pts — "${best.name}" looks dominant, not a decision.`);
    }
  }
}

console.log('\nRead it like this: if one row wins by a wide margin at every cap, that');
console.log('strategy is the game. You want the rows close together and the binding');
console.log('percentages high at every bury count.\n');
