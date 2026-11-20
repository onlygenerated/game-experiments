/**
 * Balance probe: plays many runs with the explorer bot (visits every room,
 * eats when Hungry, drinks below 40% HP) and reports the economy per floor.
 *
 *   npx vite-node tools/probe.ts [runs=60] [scenario]
 *
 * Scenarios: fresh (rules arrive as they would in play), hunger (Peril, Halls,
 * Things, Hunger from the start), full (every rule from the start), and
 * rules: a fixed base ruleset plus one strategic rule at a time, with shrines
 * refused, to see whether each rule is a fair trade.
 */
import { Game } from '../src/engine/game.ts';
import { Rng } from '../src/engine/rng.ts';
import type { RuleId } from '../src/engine/types.ts';
import { newWorld } from '../src/engine/world.ts';
import { RULE_ORDER } from '../src/rules/rules.ts';
import { explorerAction } from '../src/__tests__/bot.ts';

const N = Number(process.argv[2] ?? 60);
const only = process.argv[3];
const MAX_DEPTH = Number(process.env.PROBE_DEPTH ?? 12);
const MAX_ACTIONS = 500 * MAX_DEPTH;

const SCENARIOS: Record<string, RuleId[] | null> = {
  fresh: null,
  hunger: ['peril', 'halls', 'things', 'hunger'],
  full: RULE_ORDER.filter((r) => r !== 'bestiary'),
};

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f1 = (x: number) => (Math.round(x * 10) / 10).toString();

for (const [name, rules] of Object.entries(SCENARIOS)) {
  if (only && only !== name) continue;
  const totals: Record<string, number> = {};
  const depths: number[] = [];
  const causes = new Map<string, number>();
  const levelAt = new Map<number, number[]>();
  const turnsPerFloor: number[] = [];
  let floors = 0;
  let foodLeft = 0;
  let satLeft = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= N; seed++) {
    const world = newWorld(seed * 7919, { premise: 'old-stone' });
    if (rules) world.rules = [...rules];
    const g = Game.start(world);
    const rng = new Rng(seed);
    let floorStart = 0;
    let lastDepth = 1;
    for (let i = 0; i < MAX_ACTIONS && !g.run.over && g.run.depth <= MAX_DEPTH; i++) {
      g.act(explorerAction(g, rng));
      if (g.run.depth !== lastDepth) {
        if (g.run.depth > lastDepth) turnsPerFloor.push(g.run.turn - floorStart);
        floorStart = g.run.turn;
        lastDepth = g.run.depth;
        if (g.has('growth')) levelAt.set(g.run.depth, [...(levelAt.get(g.run.depth) ?? []), g.run.player.level]);
      }
    }
    floors += g.tally.floorsEntered ?? 0;
    for (const [k, v] of Object.entries(g.tally)) totals[k] = (totals[k] ?? 0) + v;
    depths.push(g.run.depth);
    const c = g.run.over ? (g.run.cause ?? '').replace(/ on depth \d+/, '').replace(/^slain by an? /, '') : g.run.depth > MAX_DEPTH ? `reached ${MAX_DEPTH + 1}` : 'timed out';
    causes.set(c, (causes.get(c) ?? 0) + 1);
    const food = g.run.player.inventory.filter((i) => i.kind === 'food');
    foodLeft += food.length;
    satLeft += food.reduce((s, i) => s + (i.nourish ?? 0), 0);
  }
  const per = (k: string) => f1((totals[k] ?? 0) / Math.max(1, floors));
  console.log(`\n=== ${name}: ${N} runs, ${floors} floors, ${f1((performance.now() - t0) / 1000)}s`);
  console.log(`depth reached p10/p50/p90: ${pct(depths, 0.1)}/${pct(depths, 0.5)}/${pct(depths, 0.9)}   turns per floor p50: ${pct(turnsPerFloor, 0.5) ?? '-'}`);
  console.log(`ends: ${[...causes].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`);
  console.log(`per floor — damage taken ${per('damageTaken')}  heal: potion ${per('healPotion')} regen ${per('healRegen')} shrine ${per('healShrine')} mend ${per('healMend')}`);
  console.log(`per floor — potions spawned ${per('spawn_potion')} drunk ${per('potionsDrunk')}   kills ${per('kills')}   arms spawned ${f1(((totals.spawn_weapon ?? 0) + (totals.spawn_armor ?? 0)) / Math.max(1, floors))}`);
  if (totals.hungerTurns) {
    const drained = totals.hungerTurns; // drain 1/turn (variant worlds a bit more)
    console.log(
      `hunger — satiety per floor: spawned ${per('satietySpawned')}, eaten ${per('satietyEaten')}, drained ~${f1(drained / floors)}, wasted ${per('satietyWasted')}` +
        `   supply/demand ${f1((totals.satietySpawned ?? 0) / drained)}x` +
        `   starving ${f1((100 * (totals.starvingTurns ?? 0)) / drained)}% of turns, regen ${f1((100 * (totals.regenTurns ?? 0)) / drained)}%` +
        `   food left at end ${f1(foodLeft / N)} items (${f1(satLeft / N)} satiety)`,
    );
  }
  if (levelAt.size) {
    console.log(`level on arrival (median) by depth: ${[...levelAt].sort((a, b) => a[0] - b[0]).map(([d, ls]) => `d${d}:${pct(ls, 0.5)}`).join(' ')}`);
  }
}

// ---------------------------------------------------------------------------
// Rule-by-rule: is each strategic rule a fair trade?
// ---------------------------------------------------------------------------
if (!only || only === 'rules') {
  const base: RuleId[] = ['peril', 'halls', 'things', 'growth', 'arms'];
  const extras: (RuleId | null)[] = [null, 'weight', 'durability', 'elements', 'darkness', 'hunger', 'arcana', 'bestiary'];
  console.log(`\n=== rules: base ${base.join('+')}, ${N} runs each, shrines refused`);
  for (const extra of extras) {
    const depths: number[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const world = newWorld(seed * 104729, { premise: 'old-stone' });
      world.rules = extra ? [...base, extra] : [...base];
      // Hold Bestiary off unless it's the rule under test.
      world.emergence = { ...world.emergence, bestiary: extra === 'bestiary' ? 1 : 99 };
      const g = Game.start(world);
      const rng = new Rng(seed);
      for (let i = 0; i < MAX_ACTIONS && !g.run.over && g.run.depth <= MAX_DEPTH; i++) g.act(explorerAction(g, rng, { shrines: false }));
      depths.push(g.run.depth);
    }
    const reached = depths.filter((d) => d > MAX_DEPTH).length;
    console.log(`  ${(extra ? `+${extra}` : 'base').padEnd(12)} depth p25/p50/p75 ${pct(depths, 0.25)}/${pct(depths, 0.5)}/${pct(depths, 0.75)}  mean ${f1(mean(depths))}  reached ${MAX_DEPTH + 1}: ${reached}`);
  }
}
