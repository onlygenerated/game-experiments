import { describe, expect, it } from 'vitest';
import { distanceMap, generateLayout, idx, passable } from '../engine/dungeon.ts';
import { Game } from '../engine/game.ts';
import { hashSeed, Rng } from '../engine/rng.ts';
import { T_WALL, type Item, type RuleId, type World } from '../engine/types.ts';
import { memoryKV, migrateWorld, newWorld, Store } from '../engine/world.ts';
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
        expect(f.shrine).not.toBeNull();
        expect(passable(f, f.shrine!.pos.x, f.shrine!.pos.y)).toBe(true);
        for (const k of Object.keys(f.glimmer)) expect(f.tiles[Number(k)]).not.toBe(T_WALL);
      }
    }
  });
});

describe('single-room floors', () => {
  it('are the full floor’s largest room, with start, stairs and shrine inside', () => {
    for (let seed = 0; seed < 40; seed++) {
      const full = generateLayout(seed, 2);
      const solo = generateLayout(seed, 2, { halls: false, sprawl: false });
      expect(solo.solo).toBe(true);
      expect(solo.rooms).toHaveLength(1);
      const spots = [solo.start, solo.stairs, solo.shrine!.pos];
      for (const s of spots) expect(passable(solo, s.x, s.y)).toBe(true);
      expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(3);
      // Every open tile of the room is open in the full floor too.
      for (let i = 0; i < solo.tiles.length; i++) if (solo.tiles[i] !== T_WALL) expect(full.tiles[i]).not.toBe(T_WALL);
    }
  });
});

describe('rule graph', () => {
  it('starts with only prerequisite-free, draftable rules on the frontier', () => {
    expect(frontier(new Set())).toEqual(['halls', 'peril', 'things']);
    expect(frontier(new Set<RuleId>(['peril']))).toEqual(['halls', 'things', 'growth', 'darkness']);
    expect(frontier(new Set<RuleId>(['peril', 'things']))).toEqual(['halls', 'growth', 'arms', 'darkness', 'hunger']);
    expect(frontier(new Set<RuleId>(['peril', 'things', 'arms']))).toContain('weight');
  });

  it('hides rules that have not emerged yet', () => {
    const emergence = { halls: 6, things: 1, peril: 2 };
    expect(frontier(new Set(), { depth: 1, emergence })).toEqual(['things']);
    expect(frontier(new Set(), { depth: 2, emergence })).toEqual(['peril', 'things']);
    expect(frontier(new Set(), { depth: 6, emergence })).toEqual(['halls', 'peril', 'things']);
  });

  it('never offers forced rules at shrines', () => {
    const all = new Set<RuleId>(RULE_ORDER.filter((r) => r !== 'bestiary'));
    expect(frontier(all)).toEqual([]);
  });

  it('only allows repealing leaves', () => {
    const r = repealable(new Set<RuleId>(['peril', 'halls', 'things', 'arms', 'weight', 'growth']));
    expect(r).toContain('weight');
    expect(r).toContain('growth');
    expect(r).toContain('halls');
    expect(r).not.toContain('arms');
    expect(r).not.toContain('things');
    expect(r).not.toContain('peril');
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
  it('Tier 0 is one quiet room with a shrine', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = Game.start(newWorld(seed));
      expect(g.world.rules).toEqual([]);
      expect(g.run.items).toEqual([]);
      expect(g.run.monsters).toEqual([]);
      expect(g.run.floor.solo).toBe(true);
      expect(g.run.floor.shrine).not.toBeNull();
    }
  });

  it('the first shrine offers at least two rules, all of which have emerged', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = Game.start(newWorld(seed));
      const sh = g.run.floor.shrine!;
      g.run.player.x = sh.pos.x - 1;
      g.run.player.y = sh.pos.y;
      if (!passable(g.run.floor, g.run.player.x, g.run.player.y)) g.run.player.x = sh.pos.x + 1;
      g.act({ type: 'move', dx: sh.pos.x - g.run.player.x, dy: 0 });
      expect(g.run.pending?.kind).toBe('shrine');
      expect(sh.offers!.length).toBeGreaterThanOrEqual(2);
      for (const r of sh.offers!) expect(g.world.emergence[r] ?? 1).toBe(1);
    }
  });

  it('Halls arriving mid-floor opens the room into the full floor', () => {
    const g = Game.start(newWorld(8));
    const before = g.run.floor;
    const open = (f: typeof before) => f.tiles.filter((t) => t !== T_WALL).length;
    g.adopt('halls', 'shrine');
    const after = g.run.floor;
    expect(after.solo).toBeFalsy();
    expect(open(after)).toBeGreaterThan(open(before) * 2);
    expect(passable(after, g.run.player.x, g.run.player.y)).toBe(true);
    expect(after.shrine).toBe(before.shrine);
    expect(after.stairs).toEqual(generateLayout(g.world.seed, 1).stairs);
  });

  it('Peril arriving mid-floor brings rats, but not right beside you', () => {
    const g = Game.start(newWorld(9));
    g.adopt('peril', 'shrine');
    const p = g.run.player;
    expect(g.run.monsters.length).toBeGreaterThanOrEqual(2);
    for (const m of g.run.monsters) expect(Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y))).toBeGreaterThanOrEqual(3);
  });

  it('imposed rules arrive by themselves once emerged', () => {
    const world = newWorld(12);
    world.rules = ['peril', 'halls', 'growth'];
    world.emergence.bestiary = 3;
    const g = Game.start(world);
    const descend = () => {
      g.run.player.x = g.run.floor.stairs.x;
      g.run.player.y = g.run.floor.stairs.y;
      g.act({ type: 'descend' });
    };
    descend();
    expect(world.rules).not.toContain('bestiary');
    descend();
    expect(world.rules).toContain('bestiary');
  });

  it('the fifth kill brings Things, which fills the current floor', () => {
    const world = newWorld(5);
    world.rules = ['peril', 'halls'];
    const g = Game.start(world);
    const p = g.run.player;
    p.hp = 999;
    let guard = 0;
    while (!g.world.rules.includes('things') && guard++ < 200) {
      // Early floors are sparse now; keep a rat on hand.
      if (!g.run.monsters.length) {
        g.run.monsters.push({ id: 900 + guard, kind: 'rat', x: p.x, y: p.y, hp: 3, maxHp: 3, atk: 1, def: 0, xp: 2, aware: true, stun: 0, element: null });
      }
      const m = g.run.monsters[0];
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
      else if (seed % 3 === 0) world.rules = ['peril'];
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
    world.rules = ['peril', 'halls', 'things', 'arms'];
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
    expect(heir.world.rules).toEqual(['peril', 'halls', 'things', 'arms']);
    expect(heir.floorGraves()).toHaveLength(1);
  });

  it('a saved run resumes exactly', () => {
    const store = new Store(memoryKV());
    const world = newWorld(21);
    world.rules = ['peril', 'halls', 'things', 'growth', 'arms', 'weight', 'darkness'];
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

describe('emergence', () => {
  const worlds = Array.from({ length: 4000 }, (_, i) => newWorld(i + 1));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('is usually early, with a small chance of a long wait', () => {
    for (const id of ['halls', 'things', 'growth', 'darkness'] as RuleId[]) {
      const ds = worlds.map((w) => w.emergence[id] ?? 1);
      expect(mean(ds)).toBeGreaterThan(1.6);
      expect(mean(ds)).toBeLessThan(3.2);
      const late = ds.filter((d) => d >= 5).length / ds.length;
      expect(late).toBeGreaterThan(0.06);
      expect(late).toBeLessThan(0.18);
      expect(Math.max(...ds)).toBeGreaterThanOrEqual(10);
    }
  });

  it('never makes Peril wait long, and the deep wakes later', () => {
    expect(Math.max(...worlds.map((w) => w.emergence.peril ?? 1))).toBeLessThanOrEqual(3);
    expect(Math.min(...worlds.map((w) => w.emergence.bestiary ?? 1))).toBeGreaterThanOrEqual(3);
  });

  it('always leaves the first shrine a choice', () => {
    for (const w of worlds) {
      const early = (['halls', 'peril', 'things'] as RuleId[]).filter((r) => (w.emergence[r] ?? 1) === 1);
      expect(early.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('old saved worlds keep the rats and rooms they always had', () => {
    const old = { ...newWorld(77), version: undefined, emergence: undefined, rules: ['things'] as RuleId[] } as unknown as World;
    const m = migrateWorld(old);
    expect(m.rules).toEqual(['halls', 'peril', 'things']);
    expect(m.emergence.bestiary).toBe(4);
  });
});
