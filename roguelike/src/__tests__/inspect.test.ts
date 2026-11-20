import { describe, expect, it } from 'vitest';
import { makeItem } from '../engine/content.ts';
import { DIRS, idx, passable } from '../engine/dungeon.ts';
import { Game, INVENTORY_CAP, type AutoPickup } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import type { ItemKind, Monster, RuleId } from '../engine/types.ts';
import { memoryKV, newWorld } from '../engine/world.ts';
import { ctxOf } from '../rules/rules.ts';
import { describeTile } from '../ui/describe.ts';
import { DEFAULT_OPTIONS, loadOptions, saveOptions } from '../ui/options.ts';

function game(rules: RuleId[], seed = 3) {
  const world = newWorld(seed, { premise: 'old-stone' });
  world.rules = rules;
  const g = Game.start(world);
  g.run.monsters = [];
  g.run.items = [];
  g.run.floor.glimmer = {};
  g.refreshVision();
  return g;
}

/** An open neighbouring tile that isn't the shrine. */
function besidePlayer(g: Game) {
  const p = g.run.player;
  const sh = g.run.floor.shrine?.pos;
  for (const d of DIRS) {
    const x = p.x + d.x;
    const y = p.y + d.y;
    if (passable(g.run.floor, x, y) && !(sh && sh.x === x && sh.y === y)) return { x, y, d };
  }
  throw new Error('no open neighbour');
}

function drop(g: Game, kind: ItemKind, x: number, y: number) {
  const item = makeItem(kind, 1, { rng: new Rng(1), ctx: ctxOf(g.world), lex: g.lex, nextId: () => g.run.nextId++ });
  g.run.items.push({ item, x, y });
  return item;
}

describe('pickup', () => {
  const step = (mode: AutoPickup) => {
    const g = game(['things']);
    g.autoPickup = mode;
    const t = besidePlayer(g);
    drop(g, 'gold', t.x, t.y);
    const potion = drop(g, 'potion', t.x, t.y);
    g.act({ type: 'move', dx: t.d.x, dy: t.d.y });
    return { g, potion };
  };

  it('Everything takes it all as you walk', () => {
    const { g } = step('all');
    expect(g.itemsHere()).toHaveLength(0);
    expect(g.run.player.gold).toBeGreaterThan(0);
    expect(g.run.player.inventory).toHaveLength(1);
  });

  it('Gold only leaves the rest and says what is there', () => {
    const { g } = step('gold');
    expect(g.run.player.gold).toBeGreaterThan(0);
    expect(g.itemsHere().map((fi) => fi.item.kind)).toEqual(['potion']);
    expect(g.run.log.at(-1)?.text).toMatch(/You see a Healing Potion here\. Press g/);
  });

  it('Off leaves everything, and g picks it up for a turn', () => {
    const { g, potion } = step('none');
    expect(g.itemsHere()).toHaveLength(2);
    const turn = g.run.turn;
    g.act({ type: 'pickup', id: potion.id });
    expect(g.run.player.inventory.map((i) => i.id)).toEqual([potion.id]);
    expect(g.run.turn).toBe(turn + 1);
    g.act({ type: 'pickup' });
    expect(g.itemsHere()).toHaveLength(0);
    expect(g.run.player.gold).toBeGreaterThan(0);
  });

  it('picking up nothing, or into a full pack, costs no turn', () => {
    const g = game(['things']);
    const turn = g.run.turn;
    g.act({ type: 'pickup' });
    expect(g.run.turn).toBe(turn);
    const p = g.run.player;
    for (let i = 0; i < INVENTORY_CAP; i++) p.inventory.push(drop(g, 'potion', -1, -1));
    drop(g, 'potion', p.x, p.y);
    g.act({ type: 'pickup' });
    expect(g.run.turn).toBe(turn);
    expect(g.itemsHere()).toHaveLength(1);
  });
});

describe('inspecting a tile', () => {
  it('names a monster with its HP and how hard it hits', () => {
    const g = game(['peril', 'halls']);
    const t = besidePlayer(g);
    const rat: Monster = { id: 50, kind: 'rat', x: t.x, y: t.y, hp: 2, maxHp: 3, atk: 2, def: 0, xp: 2, aware: false, stun: 0, element: null };
    g.run.monsters.push(rat);
    const info = describeTile(g, t.x, t.y);
    expect(info.title).toBe('Rat');
    expect(info.lines[0]).toBe('HP 2/3 · hits you for 2');
  });

  it('shows an item’s known stats and counts what it hides', () => {
    const g = game(['things', 'peril', 'arms']);
    const t = besidePlayer(g);
    const w = drop(g, 'weapon', t.x, t.y);
    const info = describeTile(g, t.x, t.y);
    expect(info.title).toBe(w.name);
    expect(info.lines[0]).toContain(`Attack +${w.atk}`);
    expect(info.lines[0]).toMatch(/things? you can’t perceive yet/);
  });

  it('describes the shrine, and what it offered once seen', () => {
    const g = game([]);
    const sh = g.run.floor.shrine!;
    expect(describeTile(g, sh.pos.x, sh.pos.y).title).toBe('Rule Shrine');
    expect(describeTile(g, sh.pos.x, sh.pos.y).lines).toContain('Step onto it to see what it offers.');
    sh.offers = ['peril', 'things'];
    expect(describeTile(g, sh.pos.x, sh.pos.y).lines[0]).toBe('Offers: Peril, Things. Step onto it to choose.');
  });

  it('a glimmering stone is a tease until Elements, then a hazard', () => {
    const g = game(['peril', 'halls']);
    const t = besidePlayer(g);
    g.run.floor.glimmer[idx(g.run.floor, t.x, t.y)] = 'ember';
    expect(describeTile(g, t.x, t.y).lines.join(' ')).toMatch(/faintly warm\. It does nothing — yet/);
    g.world.rules.push('things', 'arms', 'elements');
    const lit = describeTile(g, t.x, t.y);
    expect(lit.title).toBe('Ember stone');
    expect(lit.lines.join(' ')).toMatch(/Burns anyone/);
  });

  it('in the dark, unseen tiles are unknown and remembered ones hide their contents', () => {
    const g = game(['peril', 'halls', 'darkness']);
    const f = g.run.floor;
    expect(describeTile(g, f.stairs.x, f.stairs.y).known).toBe(false);
    const t = besidePlayer(g);
    g.run.monsters.push({ id: 51, kind: 'rat', x: t.x, y: t.y, hp: 3, maxHp: 3, atk: 1, def: 0, xp: 2, aware: false, stun: 0, element: null });
    g.visible.delete(idx(f, t.x, t.y));
    const info = describeTile(g, t.x, t.y);
    expect(info.known).toBe(true);
    expect(info.title).toBe('Floor');
    expect(info.lines[0]).toMatch(/Remembered/);
  });

  it('a wall is a wall', () => {
    const g = game([]);
    const wall = g.run.floor.tiles.findIndex((t) => t === 0);
    const info = describeTile(g, wall % g.run.floor.w, Math.floor(wall / g.run.floor.w));
    expect(info.title).toBe('Wall');
    expect(info.walkable).toBe(false);
  });
});

describe('options', () => {
  it('round-trip, and ignore unknown keys and bad values', () => {
    const kv = memoryKV();
    expect(loadOptions(kv)).toEqual(DEFAULT_OPTIONS);
    saveOptions(kv, { ...DEFAULT_OPTIONS, autoPickup: 'gold', vibrate: false });
    expect(loadOptions(kv)).toMatchObject({ autoPickup: 'gold', vibrate: false });
    kv.setItem('unfolding.options.v1', JSON.stringify({ autoPickup: 'sometimes', tileSize: 'large', junk: 1 }));
    expect(loadOptions(kv)).toEqual({ ...DEFAULT_OPTIONS, tileSize: 'large' });
    kv.setItem('unfolding.options.v1', '{not json');
    expect(loadOptions(kv)).toEqual(DEFAULT_OPTIONS);
  });
});
