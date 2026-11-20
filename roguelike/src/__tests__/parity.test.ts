/**
 * Phase 2's exit criterion: no Means of Harm is a trap. The explorer bot plays
 * the same seeded worlds under each means; their average depths must stay
 * within a floor and a half of each other. (The full measurement, with more
 * runs and medians, is `npx vite-node tools/probe.ts 160 harm`.)
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import { newWorld } from '../engine/world.ts';
import { HARMS } from '../rules/harm.ts';
import { explorerAction } from './bot.ts';

const RUNS = 40;
const MAX_DEPTH = 12;

function meanDepth(harm: (typeof HARMS)[number]): number {
  let total = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const g = Game.start(newWorld(seed * 7919, { premise: 'old-stone', harm }));
    const rng = new Rng(seed);
    for (let i = 0; i < 500 * MAX_DEPTH && !g.run.over && g.run.depth <= MAX_DEPTH; i++) g.act(explorerAction(g, rng));
    total += g.run.depth;
  }
  return total / RUNS;
}

describe('Means of Harm parity', () => {
  it('every means takes the explorer about as deep as the others', { timeout: 120_000 }, () => {
    const depths = Object.fromEntries(HARMS.map((h) => [h, meanDepth(h)]));
    const spread = Math.max(...Object.values(depths)) - Math.min(...Object.values(depths));
    expect(spread, JSON.stringify(depths)).toBeLessThanOrEqual(1.5);
    // And none of them is a dead end on the first floors.
    for (const [h, d] of Object.entries(depths)) expect(d, h).toBeGreaterThan(5);
  });
});
