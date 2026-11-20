import { describe, expect, it } from 'vitest';
import { ray } from '../engine/aim.ts';
import { lineOfSight } from '../engine/fov.ts';
import { BALANCE as B } from '../engine/balance.ts';
import { makeItem } from '../engine/content.ts';
import { Game } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import { T_FLOOR, T_WALL, type Floor, type Monster, type MonsterKind, type RuleId } from '../engine/types.ts';
import { newWorld, rollHarm } from '../engine/world.ts';
import { HARMS, type HarmId } from '../rules/harm.ts';
import { ctxOf, derive } from '../rules/rules.ts';
import { PREMISES } from '../theme/lexicon.ts';

/** A walled box, open inside, with optional extra wall tiles. */
function arena(w: number, h: number, walls: [number, number][] = []): Floor {
  const tiles: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? T_WALL : T_FLOOR);
  for (const [x, y] of walls) tiles[y * w + x] = T_WALL;
  return {
    depth: 1, w, h, tiles, glimmer: {}, rooms: [{ x: 1, y: 1, w: w - 2, h: h - 2 }],
    start: { x: 1, y: 1 }, stairs: { x: w - 2, y: h - 2 }, shrine: null, explored: new Array(w * h).fill(1),
  };
}

function game(harm: HarmId | null, rules: RuleId[] = ['peril'], floor = arena(16, 9)) {
  const world = newWorld(41, { premise: 'old-stone', harm });
  world.rules = rules;
  const g = Game.start(world);
  g.run.floor = floor;
  g.run.monsters = [];
  g.run.items = [];
  g.run.player.x = 2;
  g.run.player.y = 4;
  g.refreshVision();
  return g;
}

let nextFoe = 500;
function foe(g: Game, x: number, y: number, kind: MonsterKind = 'rat', hp = 10): Monster {
  const m: Monster = { id: nextFoe++, kind, x, y, hp, maxHp: hp, atk: 1, def: 0, xp: 2, aware: true, stun: 0, element: null };
  g.run.monsters.push(m);
  g.refreshVision();
  return m;
}

describe('aiming', () => {
  it('a ray passes through the tile aimed at and carries on to its range, stopping at walls', () => {
    const f = arena(16, 9);
    const path = ray(f, { x: 2, y: 4 }, { x: 4, y: 5 }, 6);
    expect(path).toHaveLength(6);
    expect(path).toContainEqual({ x: 4, y: 5 });
    expect(ray(f, { x: 2, y: 4 }, { x: 2, y: 2 }, 10).at(-1)).toEqual({ x: 2, y: 1 });
  });
});

describe('Strike', () => {
  it('has nothing to aim: firing does nothing', () => {
    const g = game('strike');
    foe(g, 5, 4);
    expect(g.act({ type: 'fire' })).toBe(false);
    expect(g.run.turn).toBe(0);
  });
});

describe('Volley', () => {
  it('a shot hits the first body in the line, spends a shot, and the shot lands', () => {
    const g = game('volley');
    const near = foe(g, 5, 4);
    const far = foe(g, 7, 4);
    const before = g.run.player.ammo!;
    expect(before).toBe(B.harm.startAmmo);
    expect(g.targets()).toEqual([near]);
    g.act({ type: 'fire', x: far.x, y: far.y });
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(g.run.player.ammo).toBe(before - 1);
    const onGround = g.run.items.filter((fi) => fi.item.kind === 'ammo').reduce((s, fi) => s + (fi.item.amount ?? 0), 0);
    expect(onGround).toBeLessThanOrEqual(1);
    expect(g.events.some((e) => e.type === 'shot')).toBe(true);
  });

  it('walking into a foe shoves it back instead of harming it', () => {
    const g = game('volley');
    const m = foe(g, 3, 4);
    g.act({ type: 'move', dx: 1, dy: 0 });
    expect(m.hp).toBe(m.maxHp);
    expect(m.x).toBe(4);
  });

  it('reaches only so far, and Weight shortens it', () => {
    const g = game('volley', ['peril', 'things', 'arms', 'weight']);
    foe(g, 2 + B.harm.volleyRange + 1, 4);
    expect(g.targets()).toEqual([]);
    const p = g.run.player;
    p.str = 9;
    p.weapon = { ...makeItem('weapon', 9, { rng: new Rng(2), ctx: ctxOf(g.world), lex: g.lex, nextId: () => 1 }), weight: 6 };
    expect(derive(p, g.ctx).range).toBe(B.harm.volleyRange - 2);
  });

  it('with no shots left, there is nothing to fire', () => {
    const g = game('volley');
    foe(g, 5, 4);
    g.run.player.ammo = 0;
    expect(g.act({ type: 'fire' })).toBe(false);
  });

  it('shots lying about are collected', () => {
    const g = game('volley');
    g.run.player.ammo = 0;
    const item = makeItem('ammo', 1, { rng: new Rng(1), ctx: ctxOf(g.world), lex: g.lex, nextId: () => 99 });
    g.run.items.push({ item, x: 3, y: 4 });
    g.act({ type: 'move', dx: 1, dy: 0 });
    expect(g.run.player.ammo).toBe(item.amount);
  });

  it('skirmishers keep their distance and shoot back', () => {
    const g = game('volley');
    const gob = foe(g, 4, 4, 'goblin');
    gob.atk = 3;
    const hp = g.run.player.hp;
    for (let i = 0; i < 6; i++) g.act({ type: 'wait' });
    expect(Math.max(Math.abs(gob.x - 2), Math.abs(gob.y - 4))).toBeGreaterThan(B.harm.skirmishKeep);
    expect(g.run.player.hp).toBeLessThan(hp);
  });
});

describe('Arcanum', () => {
  it('a bolt passes through everything on its line, for mana', () => {
    const g = game('arcanum');
    const a = foe(g, 4, 4);
    const b = foe(g, 5, 4);
    const mana = g.run.player.mana;
    expect(mana).toBe(B.harm.arcanumMana);
    g.act({ type: 'fire', x: 5, y: 4 });
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(g.run.player.mana).toBe(mana - B.harm.boltCost);
  });

  it('without mana there is no bolt; mana comes back with time', () => {
    const g = game('arcanum');
    foe(g, 5, 4);
    g.run.player.mana = 0;
    expect(g.act({ type: 'fire' })).toBe(false);
    for (let i = 0; i < B.harm.arcanumManaEvery; i++) g.act({ type: 'wait' });
    expect(g.run.player.mana).toBeGreaterThan(0);
  });
});

describe('Discourse', () => {
  // A wall between you and the foe: no line, but a short way round.
  const corner = () => arena(16, 9, [[4, 1], [4, 2], [4, 3], [4, 4]]);

  it('reaches around corners to anyone within earshot', () => {
    const g = game('discourse', ['peril'], corner());
    const m = foe(g, 5, 4);
    expect(lineOfSight(g.run.floor, g.run.player, m)).toBe(false);
    expect(g.targets()).toEqual([m]);
    g.act({ type: 'fire' });
    expect(m.hp).toBeLessThan(m.maxHp);
  });

  it('bystanders within earshot hear it and turn', () => {
    const g = game('discourse');
    const m = foe(g, 4, 4);
    const by = foe(g, 2, 6);
    by.aware = false;
    g.act({ type: 'fire', x: m.x, y: m.y });
    expect(by.aware).toBe(true);
  });

  it('a foe left alone gathers its composure again', () => {
    const g = game('discourse');
    const m = foe(g, 12, 7);
    m.aware = false;
    m.hp = 5;
    for (let i = 0; i < B.harm.composureEvery * 3; i++) g.act({ type: 'wait' });
    expect(m.hp).toBeGreaterThan(5);
  });
});

describe('the Means of Harm axiom', () => {
  it('new worlds roll every means, and leave some open for a schism shrine', () => {
    const counts = new Map<HarmId | null, number>();
    for (let s = 1; s <= 2000; s++) {
      const h = rollHarm(s);
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    for (const h of HARMS) expect(counts.get(h) ?? 0, h).toBeGreaterThan(200);
    expect((counts.get(null) ?? 0) / 2000).toBeGreaterThan(0.3);
  });

  it('a rolled means is announced when foes first arrive', () => {
    const world = newWorld(8, { premise: 'tidepool', harm: 'discourse' });
    const g = Game.start(world);
    g.adopt('peril', 'shrine');
    expect(g.events).toContainEqual({ type: 'axiom', harm: 'discourse', how: 'rolled' });
    expect(g.run.log.some((l) => l.text.includes(PREMISES.tidepool.means.discourse.name))).toBe(true);
  });

  it('an open world raises a schism shrine with the first foes; answering it settles the world for good', () => {
    const world = newWorld(9, { premise: 'merger', harm: null });
    expect(world.genome.axioms.harm).toBeUndefined();
    const g = Game.start(world);
    expect(g.harmSettled).toBe(false);
    g.adopt('peril', 'shrine');
    const sc = g.run.floor.schism!;
    expect(sc).toBeTruthy();
    expect(sc.offers).toHaveLength(B.harm.schismOffers);
    // Until it's answered, harm is struck.
    expect(g.ctx.harm).toBe('strike');
    g.run.monsters = [];
    g.run.player.x = sc.pos.x;
    g.run.player.y = sc.pos.y;
    (g as unknown as { enterTile(): number }).enterTile();
    expect(g.run.pending).toEqual({ kind: 'schism' });
    const pick = sc.offers.find((h) => h !== 'strike')!;
    g.act({ type: 'schism', harm: pick });
    expect(world.genome.axioms.harm).toBe(pick);
    expect(g.ctx.harm).toBe(pick);
    // The words follow: the world's implements are now the means' implements.
    expect(g.lex.role('weapon')).toBe(PREMISES.merger.means[pick].roles!.weapon);
    // The next floor has no schism: the question is closed.
    g.events.splice(0);
    g.run.player.x = g.run.floor.stairs.x;
    g.run.player.y = g.run.floor.stairs.y;
    g.act({ type: 'descend' });
    expect(g.run.floor.schism ?? null).toBeNull();
  });

  it('every new heir in an open world meets a schism shrine on their first floor once foes exist', () => {
    const world = newWorld(10, { premise: 'ministry', harm: null });
    world.rules = ['peril'];
    const g = Game.start(world);
    expect(g.run.floor.schism).toBeTruthy();
  });
});

describe('Commerce', () => {
  function shop() {
    const g = game('strike', ['peril', 'things']);
    g.run.floor = arena(16, 9);
    g.adopt('commerce', 'shrine');
    return g;
  }

  it('arrives with a merchant on the floor, selling by depth', () => {
    const g = shop();
    const mc = g.run.floor.merchant!;
    expect(mc).toBeTruthy();
    expect(mc.stock.length).toBeGreaterThan(0);
    for (const it of mc.stock) expect(g.priceOf(it)).toBeGreaterThan(0);
  });

  it('buying costs currency and fills the pack; too poor, nothing happens', () => {
    const g = shop();
    const mc = g.run.floor.merchant!;
    const item = mc.stock[0];
    g.run.player.x = mc.pos.x;
    g.run.player.y = mc.pos.y;
    (g as unknown as { enterTile(): number }).enterTile();
    expect(g.run.pending).toEqual({ kind: 'shop' });
    g.run.player.gold = 0;
    expect(g.act({ type: 'buy', id: item.id })).toBe(false);
    g.run.player.gold = 1000;
    g.act({ type: 'buy', id: item.id });
    expect(g.run.player.gold).toBe(1000 - g.priceOf(item));
    expect(g.run.player.inventory).toContain(item);
    g.act({ type: 'sell', id: item.id });
    expect(g.run.player.inventory).not.toContain(item);
    g.act({ type: 'leaveShop' });
    expect(g.run.pending).toBeNull();
  });

  it('a shrine can be paid, once, to show other offers', () => {
    const world = newWorld(12, { premise: 'old-stone' });
    world.rules = ['peril', 'things', 'commerce'];
    const g = Game.start(world);
    const sh = g.run.floor.shrine!;
    g.run.player.x = sh.pos.x;
    g.run.player.y = sh.pos.y;
    g.run.monsters = [];
    (g as unknown as { enterTile(): number }).enterTile();
    expect(g.run.pending).toEqual({ kind: 'shrine' });
    const first = [...sh.offers!];
    const cost = g.rerollCost();
    expect(cost).toBeGreaterThan(0);
    g.run.player.gold = cost!;
    g.act({ type: 'reroll' });
    expect(g.run.player.gold).toBe(0);
    expect(sh.offers!.some((r) => !first.includes(r))).toBe(true);
    expect(g.rerollCost()).toBeNull();
  });
});
