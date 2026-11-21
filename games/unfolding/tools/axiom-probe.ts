/**
 * Phase 3 parity probe: the explorer bot plays the same seeded worlds under
 * each Shape of Space and Flow of Time, with harm rolled as usual.
 *
 *   npx vite-node tools/axiom-probe.ts [runs] [maxDepth]
 */
import { Game } from '../src/engine/game.ts';
import { Rng } from '../src/engine/rng.ts';
import { newWorld } from '../src/engine/world.ts';
import type { SpaceId, TimeId } from '../src/engine/types.ts';
import { explorerAction } from '../src/__tests__/bot.ts';

const runs = Number(process.argv[2] ?? 60);
const maxDepth = Number(process.argv[3] ?? 14);

function play(space: SpaceId, time: TimeId) {
  const depths: number[] = [];
  let tideDeaths = 0;
  let wins = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const g = Game.start(newWorld(seed * 7919, { premise: 'old-stone', harm: 'strike', space, time }));
    const rng = new Rng(seed);
    for (let i = 0; i < 600 * maxDepth && !g.run.over && g.run.depth <= maxDepth; i++) g.act(explorerAction(g, rng));
    depths.push(g.run.depth);
    if (g.run.cause?.includes('drown')) tideDeaths++;
    if (g.run.won) wins++;
  }
  depths.sort((a, b) => a - b);
  const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
  console.log(`${space.padEnd(8)} ${time.padEnd(6)} mean ${mean.toFixed(2)} median ${depths[depths.length >> 1]} tide-deaths ${tideDeaths} wins ${wins}`);
}

const combos = (process.argv[4] ?? 'rooms:turns,caverns:turns,rooms:tide,caverns:tide').split(',').map((c) => c.split(':'));
for (const [s, t] of combos as [SpaceId, TimeId][]) play(s, t);
