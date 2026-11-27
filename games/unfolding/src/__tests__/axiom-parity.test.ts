/**
 * Phase 3's parity check, as Phase 2's for harm: no Shape of Space or Flow of
 * Time is a trap. The explorer bot plays the same seeded worlds under each;
 * their average depths stay within a floor and a half of rooms-and-turns.
 * (The full measurement: `npx vite-node tools/axiom-probe.ts 60 14`.)
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import type { SpaceId, TimeId } from '../engine/types.ts';
import { newWorld } from '../engine/world.ts';
import { explorerAction } from './bot.ts';

const RUNS = 16;
const MAX_DEPTH = 10;

function meanDepth(space: SpaceId, time: TimeId): number {
  let total = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const g = Game.start(newWorld(seed * 7919, { premise: 'old-stone', harm: 'strike', space, time }));
    const rng = new Rng(seed);
    for (let i = 0; i < 600 * MAX_DEPTH && !g.run.over && g.run.depth <= MAX_DEPTH; i++) g.act(explorerAction(g, rng));
    total += g.run.depth;
  }
  return total / RUNS;
}

describe('space and time parity', () => {
  it('caves and the tide take the explorer about as deep as rooms and turns', { timeout: 120_000 }, () => {
    const base = meanDepth('rooms', 'turns');
    for (const [s, t] of [['caverns', 'turns'], ['drift', 'turns'], ['rooms', 'tide']] as [SpaceId, TimeId][]) {
      const d = meanDepth(s, t);
      expect(Math.abs(d - base), `${s}/${t} ${d} vs ${base}`).toBeLessThanOrEqual(1.5);
      expect(d, `${s}/${t}`).toBeGreaterThan(4);
    }
  });
});
