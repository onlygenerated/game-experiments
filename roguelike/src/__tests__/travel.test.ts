import { describe, expect, it } from 'vitest';
import { distanceMap, idx } from '../engine/dungeon.ts';
import { Game } from '../engine/game.ts';
import { canTravelTo, nearbyThreats, travelStep } from '../engine/travel.ts';
import type { RuleId } from '../engine/types.ts';
import { newWorld } from '../engine/world.ts';

function quietGame(seed: number, rules: RuleId[] = []) {
  const world = newWorld(seed);
  world.rules = rules;
  const g = Game.start(world);
  g.run.monsters = [];
  g.refreshVision();
  return g;
}

/** Walk with travelStep until arrival; returns the number of steps, or -1 if it stalled. */
function walk(g: Game, target: { x: number; y: number }, limit = 400): number {
  const p = g.run.player;
  for (let n = 0; n < limit; n++) {
    if (p.x === target.x && p.y === target.y) return n;
    const s = travelStep(g, target);
    if (!s) return -1;
    g.act({ type: 'move', dx: s.x, dy: s.y });
    if (g.run.pending) g.run.pending = null;
  }
  return -1;
}

describe('auto-travel', () => {
  it('reaches the stairs by a shortest route', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = quietGame(seed);
      const f = g.run.floor;
      const shortest = distanceMap(f, f.stairs)[idx(f, g.run.player.x, g.run.player.y)];
      expect(canTravelTo(g, f.stairs)).toBe(true);
      expect(walk(g, f.stairs)).toBe(shortest);
    }
  });

  it('refuses walls, its own tile, and unexplored ground in the dark', () => {
    const g = quietGame(3, ['peril', 'halls', 'darkness']);
    const f = g.run.floor;
    const p = g.run.player;
    expect(canTravelTo(g, { x: p.x, y: p.y })).toBe(false);
    const wall = f.tiles.findIndex((t) => t === 0);
    expect(canTravelTo(g, { x: wall % f.w, y: Math.floor(wall / f.w) })).toBe(false);
    // The stairs are in the farthest room, well outside a radius-5 light.
    expect(f.explored[idx(f, f.stairs.x, f.stairs.y)]).toBe(0);
    expect(canTravelTo(g, f.stairs)).toBe(false);
  });

  it('steps around an active ember stone when there is room to', () => {
    const g = quietGame(4, ['things', 'arms', 'elements']);
    const f = g.run.floor;
    const room = f.rooms.find((r) => r.w >= 3 && r.h >= 3)!;
    f.glimmer = {};
    const p = g.run.player;
    p.x = room.x;
    p.y = room.y + 1;
    const ember = { x: room.x + 1, y: room.y + 1 };
    f.glimmer[idx(f, ember.x, ember.y)] = 'ember';
    const target = { x: room.x + 2, y: room.y + 1 };
    const step = travelStep(g, target)!;
    expect(step).not.toBeNull();
    expect({ x: p.x + step.x, y: p.y + step.y }).not.toEqual(ember);
  });

  it('counts only visible foes within range as threats', () => {
    const g = quietGame(5);
    const p = g.run.player;
    const f = g.run.floor;
    const near = distanceMap(f, p).findIndex((d) => d === 2);
    g.run.monsters = [
      { id: 1, kind: 'rat', x: near % f.w, y: Math.floor(near / f.w), hp: 3, maxHp: 3, atk: 1, def: 0, xp: 2, aware: false, stun: 0, element: null },
      { id: 2, kind: 'rat', x: f.stairs.x, y: f.stairs.y, hp: 3, maxHp: 3, atk: 1, def: 0, xp: 2, aware: false, stun: 0, element: null },
    ];
    expect(nearbyThreats(g).map((m) => m.id)).toEqual([1]);
  });
});
