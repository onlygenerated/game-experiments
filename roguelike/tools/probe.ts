// Balance probe: how far does the greedy bot get, and which rules does it gather?
// Run: npx vite-node tools/probe.ts
import { Game } from '../src/engine/game.ts';
import { Rng } from '../src/engine/rng.ts';
import { newWorld } from '../src/engine/world.ts';
import { botAction } from '../src/__tests__/bot.ts';

const N = Number(process.argv[2] ?? 60);
const t0 = performance.now();
let acts = 0;
const depths: number[] = [];
const causes = new Map<string, number>();
const ruleCounts = new Map<string, number>();
/** Depth at which each rule entered each run's world. */
const arrival = new Map<string, number[]>();
for (let seed = 1; seed <= N; seed++) {
  const g = Game.start(newWorld(seed));
  const rng = new Rng(seed);
  const seen = new Set<string>();
  for (let i = 0; i < 4000 && !g.run.over; i++) {
    g.act(botAction(g, rng));
    acts++;
    for (const r of g.world.rules) {
      if (seen.has(r)) continue;
      seen.add(r);
      arrival.set(r, [...(arrival.get(r) ?? []), g.run.depth]);
    }
  }
  depths.push(g.run.depth);
  const c = (g.run.cause ?? 'alive').replace(/ on depth \d+/, '');
  causes.set(c, (causes.get(c) ?? 0) + 1);
  for (const r of g.world.rules) ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1);
}
const ms = performance.now() - t0;
depths.sort((a, b) => a - b);
console.log(`${N} runs, ${acts} actions, ${(ms / acts * 1000).toFixed(0)}µs/action`);
console.log('depth p10/p50/p90/max', depths[Math.floor(N * 0.1)], depths[Math.floor(N / 2)], depths[Math.floor(N * 0.9)], depths[N - 1]);
console.log('causes', Object.fromEntries(causes));
console.log('rules adopted (runs)', Object.fromEntries(ruleCounts));
console.log('arrival depth (median / max) per rule:');
for (const [r, ds] of arrival) {
  ds.sort((a, b) => a - b);
  console.log(`  ${r.padEnd(10)} ${String(ds[Math.floor(ds.length / 2)]).padStart(2)} / ${ds[ds.length - 1]}   (${ds.length} runs)`);
}
