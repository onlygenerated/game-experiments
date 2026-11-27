/** Testing mode: every new floor laid out for trying rules quickly. */
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../engine/balance.ts';
import { distanceMap, idx } from '../engine/dungeon.ts';
import { Game } from '../engine/game.ts';
import { T_HEART, T_STAIRS, type RuleId, type SpaceId } from '../engine/types.ts';
import { newWorld } from '../engine/world.ts';
import { RULE_ORDER } from '../rules/rules.ts';

const ALL = RULE_ORDER.filter((r) => r !== 'bestiary');

function testing(rules: RuleId[], seed: number, space: SpaceId = 'rooms') {
  const w = newWorld(seed, { harm: 'strike', space });
  w.rules = [...rules];
  return Game.start(w, false, true);
}

function descend(g: Game) {
  const f = g.run.floor;
  g.run.player.x = f.stairs.x;
  g.run.player.y = f.stairs.y;
  g.run.pending = null;
  g.act({ type: 'descend' });
}

/** Check a floor right after arriving on it. */
function check(g: Game, label: string) {
  const f = g.run.floor;
  const dist = distanceMap(f, g.run.player);
  const d = (x: number, y: number) => dist[idx(f, x, y)];
  expect(d(f.stairs.x, f.stairs.y), `${label} stairs`).toBeGreaterThan(0);
  expect(d(f.stairs.x, f.stairs.y), `${label} stairs`).toBeLessThanOrEqual(B.testing.near);
  expect([T_STAIRS, T_HEART]).toContain(f.tiles[idx(f, f.stairs.x, f.stairs.y)]);
  expect(f.tiles.filter((t) => t === T_STAIRS || t === T_HEART), label).toHaveLength(1);
  if (f.shrine && !f.shrine.used) {
    expect(d(f.shrine.pos.x, f.shrine.pos.y), `${label} shrine`).toBeGreaterThan(0);
    expect(d(f.shrine.pos.x, f.shrine.pos.y), `${label} shrine`).toBeLessThanOrEqual(B.testing.near);
  }
  const has = (r: RuleId) => g.world.rules.includes(r);
  const kinds = [...(has('things') ? ['potion', 'gold'] : []), ...(has('arms') ? ['weapon', 'armor'] : []), ...(has('hunger') ? ['food'] : [])];
  for (const k of kinds) {
    const near = g.run.items.some((fi) => fi.item.kind === k && d(fi.x, fi.y) >= 0 && d(fi.x, fi.y) <= B.testing.items);
    expect(near, `${label} ${k}`).toBe(true);
  }
  if (has('peril')) {
    for (const k of ['rat', 'bat', 'goblin', 'slime']) {
      const near = g.run.monsters.some((m) => m.kind === k && d(m.x, m.y) >= 0 && d(m.x, m.y) <= B.testing.far);
      expect(near, `${label} ${k}`).toBe(true);
    }
  }
  for (const el of ['ember', 'frost']) {
    const near = Object.entries(f.glimmer).some(([i, v]) => v === el && dist[Number(i)] >= 0 && dist[Number(i)] <= B.testing.far);
    expect(near, `${label} ${el} stone`).toBe(true);
  }
}

describe('testing mode', () => {
  it('lays out every new floor: shrine and stairs within 3, items within 10, every foe and hazard within 30', () => {
    for (const space of ['rooms', 'caverns', 'drift'] as SpaceId[])
      for (const rules of [[], ['peril', 'things'], ['halls', 'peril', 'things'], ALL] as RuleId[][])
        for (const seed of [3, 4, 5]) {
          const g = testing(rules, seed, space);
          for (let depth = 1; depth <= 3; depth++) {
            check(g, `${space} ${rules.join('+') || 'none'} seed ${seed} depth ${depth}`);
            descend(g);
          }
        }
  });

  it('keeps the shrine and stairs close when Halls opens the floor around you', () => {
    const g = testing(['peril', 'things'], 7);
    g.adopt('halls', 'shrine');
    const f = g.run.floor;
    expect(f.solo).toBeFalsy();
    const dist = distanceMap(f, g.run.player);
    expect(dist[idx(f, f.stairs.x, f.stairs.y)]).toBeLessThanOrEqual(B.testing.near);
  });

  it('puts the Heart close by too', () => {
    const g = testing(['peril', 'halls'], 8);
    g.world.heart = 2;
    descend(g);
    expect(g.run.floor.heart).toBe(true);
    check(g, 'heart');
  });

  it('is off by default, and changes nothing then', () => {
    const w = newWorld(9, { harm: 'strike' });
    w.rules = ['peril', 'halls', 'things'];
    const a = Game.start(w);
    const w2 = newWorld(9, { harm: 'strike' });
    w2.rules = ['peril', 'halls', 'things'];
    const b = Game.start(w2, false, false);
    expect(a.testing).toBe(false);
    expect(b.run.floor.stairs).toEqual(a.run.floor.stairs);
    expect(b.run.monsters.length).toBe(a.run.monsters.length);
  });
});
