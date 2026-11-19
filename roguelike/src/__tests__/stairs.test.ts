import { describe, expect, it } from 'vitest';
import { generateLayout, idx } from '../engine/dungeon.ts';
import { Game } from '../engine/game.ts';
import { T_UP, type RuleId } from '../engine/types.ts';
import { newWorld } from '../engine/world.ts';

const ups = (tiles: number[]) => tiles.filter((t) => t === T_UP).length;

function start(rules: RuleId[], seed = 21) {
  const world = newWorld(seed);
  world.rules = rules;
  return Game.start(world);
}

function takeStairs(g: Game, dir: 'down' | 'up') {
  const f = g.run.floor;
  const at = dir === 'down' ? f.stairs : f.start;
  g.run.player.x = at.x;
  g.run.player.y = at.y;
  g.run.pending = null;
  expect(g.act({ type: dir === 'down' ? 'descend' : 'ascend' })).toBe(true);
}

describe('stairs up', () => {
  it('sit where you arrive on every floor below the first', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const halls of [true, false]) {
        expect(ups(generateLayout(seed, 1, { halls, sprawl: false }).tiles)).toBe(0);
        const f = generateLayout(seed, 3, { halls, sprawl: false });
        expect(ups(f.tiles)).toBe(1);
        expect(f.tiles[idx(f, f.start.x, f.start.y)]).toBe(T_UP);
      }
    }
  });

  it('there are none on depth 1, and climbing elsewhere says so', () => {
    const g = start(['peril', 'halls']);
    expect(g.act({ type: 'ascend' })).toBe(false);
    expect(g.run.depth).toBe(1);
  });

  it('lead back to the floor exactly as you left it, at its stairs down', () => {
    const g = start(['peril', 'halls', 'things']);
    takeStairs(g, 'down');
    expect(g.run.depth).toBe(2);
    // Change floor 2: kill a monster, take an item.
    const killed = g.run.monsters.shift()!;
    const taken = g.run.items.shift();
    const left = { monsters: g.run.monsters.map((m) => m.id), items: g.run.items.map((i) => i.item.id), explored: [...g.run.floor.explored] };
    takeStairs(g, 'down');
    expect(g.run.depth).toBe(3);
    takeStairs(g, 'up');
    expect(g.run.depth).toBe(2);
    const f = g.run.floor;
    expect([g.run.player.x, g.run.player.y]).toEqual([f.stairs.x, f.stairs.y]);
    expect(g.run.monsters.map((m) => m.id)).toEqual(left.monsters);
    expect(g.run.monsters.some((m) => m.id === killed.id)).toBe(false);
    expect(g.run.items.map((i) => i.item.id)).toEqual(left.items);
    if (taken) expect(g.run.items.some((i) => i.item.id === taken.item.id)).toBe(false);
    expect(g.run.floor.explored).toEqual(left.explored);
    // And down again lands on floor 3's stairs up, which is where you first arrived.
    takeStairs(g, 'down');
    expect(g.run.depth).toBe(3);
    expect(g.run.floor.tiles[idx(g.run.floor, g.run.player.x, g.run.player.y)]).toBe(T_UP);
  });

  it('a floor you left catches up on rules adopted since', () => {
    const g = start([], 33);
    takeStairs(g, 'down');
    // Floor 1 was quiet and single-roomed. Adopt Peril and Halls on floor 2, then go back.
    g.adopt('peril', 'shrine');
    g.adopt('halls', 'shrine');
    takeStairs(g, 'up');
    expect(g.run.depth).toBe(1);
    expect(g.run.floor.solo).toBeFalsy();
    expect(g.run.monsters.length).toBeGreaterThan(0);
    const f = g.run.floor;
    expect([g.run.player.x, g.run.player.y]).toEqual([f.stairs.x, f.stairs.y]);
    expect(g.run.log.some((l) => /changed since you were last here/.test(l.text))).toBe(true);
  });

  it('Halls arriving mid-floor keeps the stairs up where you came in', () => {
    const g = start([], 34);
    takeStairs(g, 'down');
    const came = { ...g.run.floor.start };
    g.adopt('halls', 'shrine');
    const f = g.run.floor;
    expect(ups(f.tiles)).toBe(1);
    expect(f.tiles[idx(f, came.x, came.y)]).toBe(T_UP);
    takeStairs(g, 'up');
    expect(g.run.depth).toBe(1);
  });

  it('leaving a floor darkens its unanswered shrine, in either direction', () => {
    const g = start(['peril', 'halls'], 35);
    takeStairs(g, 'down');
    const sh = g.run.floor.shrine!;
    expect(sh.used).toBe(false);
    takeStairs(g, 'up');
    takeStairs(g, 'down');
    expect(g.run.floor.shrine).toBe(sh);
    expect(sh.dark).toBe(true);
    expect(g.shrineWouldOffer()).toBe(false);
  });
});
