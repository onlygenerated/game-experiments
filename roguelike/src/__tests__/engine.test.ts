import { describe, expect, it } from 'vitest';
import { distanceMap, generateLayout, idx, passable } from '../engine/dungeon.ts';
import { Game } from '../engine/game.ts';
import { hashSeed, Rng } from '../engine/rng.ts';
import { T_WALL, type Item, type RuleId, type World } from '../engine/types.ts';
import { memoryKV, newWorld, Store } from '../engine/world.ts';
import { ctxOf, derive, frontier, previewRule, repealable, RULE_ORDER } from '../rules/rules.ts';
import { botAction } from './bot.ts';

const greatsword = (): Item => ({
  id: 999,
  kind: 'weapon',
  name: 'Greatsword',
  atk: 8,
  weight: 6,
  element: null,
  dur: 45,
  maxDur: 45,
});

describe('rng', () => {
  it('is deterministic and serializable', () => {
    const a = new Rng(42);
    const seq = [a.next(), a.next(), a.next()];
    const b = new Rng(42);
    expect([b.next(), b.next(), b.next()]).toEqual(seq);
    const c = new Rng(a.state);
    const d = new Rng(a.state);
    expect(c.int(0, 1000)).toBe(d.int(0, 1000));
  });
  it('hashSeed separates parts', () => {
    expect(hashSeed(1, 23)).not.toBe(hashSeed(12, 3));
  });
});

describe('layout', () => {
  it('is a pure function of world seed and depth', () => {
    expect(generateLayout(7, 3)).toEqual(generateLayout(7, 3));
    expect(generateLayout(7, 3).tiles).not.toEqual(generateLayout(7, 4).tiles);
  });

  it('connects every floor tile, across many seeds', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const depth of [1, 2, 5]) {
        const f = generateLayout(seed, depth);
        expect(f.rooms.length).toBeGreaterThanOrEqual(4);
        const dist = distanceMap(f, f.start);
        for (let i = 0; i < f.tiles.length; i++) {
          if (f.tiles[i] !== T_WALL) expect(dist[i]).toBeGreaterThanOrEqual(0);
        }
        expect(f.stairs).not.toEqual(f.start);
        if (depth === 1) expect(f.shrine).toBeNull();
        else if (f.shrine) expect(passable(f, f.shrine.pos.x, f.shrine.pos.y)).toBe(true);
        for (const k of Object.keys(f.glimmer)) expect(f.tiles[Number(k)]).not.toBe(T_WALL);
      }
    }
  });
});

describe('rule graph', () => {
  it('starts with only prerequisite-free, draftable rules on the frontier', () => {
    expect(frontier(new Set())).toEqual(['growth', 'darkness']);
    expect(frontier(new Set<RuleId>(['things']))).toEqual(['growth', 'arms', 'darkness', 'hunger']);
    expect(frontier(new Set<RuleId>(['things', 'arms']))).toContain('weight');
  });

  it('never offers forced rules at shrines', () => {
    const all = new Set<RuleId>(RULE_ORDER.filter((r) => r !== 'bestiary' && r !== 'things'));
    expect(frontier(all)).not.toContain('bestiary');
  });

  it('only allows repealing leaves', () => {
    const r = repealable(new Set<RuleId>(['things', 'arms', 'weight', 'growth']));
    expect(r).toContain('weight');
    expect(r).toContain('growth');
    expect(r).not.toContain('arms');
    expect(r).not.toContain('things');
  });
});

describe('derived stats and the shrine preview', () => {
  const world = (rules: RuleId[]): Pick<World, 'rules' | 'variants'> => ({ rules, variants: {} });

  it('a heavy weapon is pure upside until Weight arrives', () => {
    const g = Game.start(newWorld(1));
    const p = g.run.player;
    p.weapon = greatsword();
    const before = derive(p, ctxOf(world(['things', 'arms'])));
    expect(before.attack).toBe(2 - 1 + 8);
    expect(before.attackCost).toBe(1);
    const after = derive(p, ctxOf(world(['things', 'arms', 'weight'])));
    expect(after.attackCost).toBe(2);
    expect(after.stagger).toBe(0);
  });

  it('Weight rewards a strong character instead', () => {
    const g = Game.start(newWorld(1));
    const p = g.run.player;
    p.weapon = greatsword();
    p.str = 6;
    const d = derive(p, ctxOf(world(['things', 'arms', 'weight'])));
    expect(d.attackCost).toBe(1);
    expect(d.stagger).toBeCloseTo(0.48);
  });

  it('preview lists the personal consequences', () => {
    const g = Game.start(newWorld(1));
    const p = g.run.player;
    p.weapon = greatsword();
    const pv = previewRule(p, ctxOf(world(['things', 'arms'])), 'weight', { glimmers: 0, monsters: 0 });
    const cost = pv.changes.find((c) => c.label === 'Attack cost');
    expect(cost).toMatchObject({ from: '1 turn', to: '2 turns', good: false });
    expect(pv.notes.join(' ')).toMatch(/Greatsword weighs 6 vs your STR 3/);
  });

  it('Iron World variant makes everything heavier', () => {
    const g = Game.start(newWorld(1));
    const p = g.run.player;
    p.weapon = { ...greatsword(), weight: 3 };
    const base = derive(p, { rules: new Set(['things', 'arms', 'weight']), variants: {} });
    const iron = derive(p, { rules: new Set(['things', 'arms', 'weight']), variants: { weight: 'alt' } });
    expect(base.attackCost).toBe(1);
    expect(iron.attackCost).toBe(2);
  });
});

describe('game', () => {
  it('Tier 0 has no objects at all', () => {
    const g = Game.start(newWorld(5));
    expect(g.world.rules).toEqual([]);
    expect(g.run.items).toEqual([]);
    expect(g.run.monsters.length).toBeGreaterThan(0);
    expect(g.run.monsters.every((m) => m.kind === 'rat')).toBe(true);
  });

  it('the fifth kill brings Things, which fills the current floor', () => {
    const g = Game.start(newWorld(5));
    const p = g.run.player;
    p.hp = 999;
    let guard = 0;
    while (!g.world.rules.includes('things') && guard++ < 200) {
      const m = g.run.monsters[0];
      if (!m) break;
      // Teleport the rat next to the player and hit it until it dies.
      m.x = p.x + 1;
      m.y = p.y;
      if (!passable(g.run.floor, m.x, m.y)) {
        m.x = p.x;
        m.y = p.y + 1;
      }
      if (!passable(g.run.floor, m.x, m.y)) {
        m.x = p.x - 1;
        m.y = p.y;
      }
      g.act({ type: 'move', dx: m.x - p.x, dy: m.y - p.y });
    }
    expect(g.world.rules).toContain('things');
    expect(g.events.some((e) => e.type === 'rule' && e.rule === 'things' && e.how === 'mastery')).toBe(true);
    expect(g.run.items.length).toBeGreaterThan(0);
  });

  it('bots play hundreds of turns without breaking invariants, under every rule', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const world = newWorld(seed);
      // Half the worlds start with everything on, so late rules get exercised.
      if (seed % 2 === 0) world.rules = RULE_ORDER.filter((r) => r !== 'bestiary');
      const g = Game.start(world);
      const rng = new Rng(seed * 31);
      for (let i = 0; i < 1000 && !g.run.over; i++) {
        g.act(botAction(g, rng));
        const { player: p, monsters, floor } = g.run;
        expect(passable(floor, p.x, p.y)).toBe(true);
        if (!g.run.over) expect(p.hp).toBeLessThanOrEqual(g.stats.maxHp);
        const seen = new Set<number>();
        for (const m of monsters) {
          expect(passable(floor, m.x, m.y)).toBe(true);
          const k = idx(floor, m.x, m.y);
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          expect(m.x === p.x && m.y === p.y).toBe(false);
        }
      }
    }
  }, 30_000);

  it('death leaves a grave and a chronicle; the next heir inherits the rulebook', () => {
    const world = newWorld(11);
    world.rules = ['things', 'arms'];
    const g = Game.start(world);
    g.run.player.weapon = greatsword();
    g.run.player.hp = 1;
    // Stand still until something kills us.
    const m = g.run.monsters[0];
    m.x = g.run.player.x + 1;
    m.y = g.run.player.y;
    if (!passable(g.run.floor, m.x, m.y)) m.y += 1;
    m.aware = true;
    for (let i = 0; i < 200 && !g.run.over; i++) g.act({ type: 'wait' });
    expect(g.run.over).toBe(true);
    expect(world.history).toHaveLength(1);
    expect(world.graves).toHaveLength(1);
    expect(world.graves[0].item?.name).toBe('Greatsword');

    const heir = Game.start(world);
    expect(heir.run.gen).toBe(2);
    expect(heir.world.rules).toEqual(['things', 'arms']);
    expect(heir.floorGraves()).toHaveLength(1);
  });

  it('a saved run resumes exactly', () => {
    const store = new Store(memoryKV());
    const world = newWorld(21);
    world.rules = ['things', 'growth', 'arms', 'weight', 'darkness'];
    const g = Game.start(world);
    const rng = new Rng(5);
    for (let i = 0; i < 60; i++) g.act(botAction(g, rng));
    store.saveWorld(world);
    store.saveRun(g.snapshot());

    const resumed = new Game(store.world(world.id)!, store.run(world.id)!);
    const r1 = new Rng(9);
    const r2 = new Rng(9);
    for (let i = 0; i < 80; i++) {
      g.act(botAction(g, r1));
      resumed.act(botAction(resumed, r2));
    }
    expect(JSON.stringify(resumed.snapshot())).toBe(JSON.stringify(g.snapshot()));
  });
});
