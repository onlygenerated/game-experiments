/**
 * Phase 3: Shape of Space (Caverns), Flow of Time (Tide Clock), and The Heart.
 */
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from '../engine/balance.ts';
import { distanceMap, generateLayout, idx, passable } from '../engine/dungeon.ts';
import { Game } from '../engine/game.ts';
import { T_HEART, T_STAIRS, T_UP, T_WALL, type RuleId, type SpaceId, type TimeId, type World } from '../engine/types.ts';
import { memoryKV, migrateWorld, newWorld, rollHeart, Store } from '../engine/world.ts';
import { SPACES, TIMES } from '../rules/axioms.ts';
import { lexiconOf, PREMISES, ROLLABLE } from '../theme/lexicon.ts';
import { codexHTML, sidebarHTML } from '../ui/hud.ts';

function start(rules: RuleId[], opts: { seed?: number; space?: SpaceId; time?: TimeId } = {}) {
  const world = newWorld(opts.seed ?? 21, { harm: 'strike', space: opts.space, time: opts.time });
  world.rules = rules;
  return Game.start(world);
}

/** Stand on the way down and take it. */
function descend(g: Game) {
  const f = g.run.floor;
  g.run.player.x = f.stairs.x;
  g.run.player.y = f.stairs.y;
  g.run.pending = null;
  return g.act({ type: 'descend' });
}

describe('rolling space and time', () => {
  it('at least one world in five plays under a non-default space or time', () => {
    let odd = 0;
    let caverns = 0;
    let tide = 0;
    const N = 2000;
    for (let s = 1; s <= N; s++) {
      const ax = newWorld(s).genome.axioms;
      if (ax.space === 'caverns') caverns++;
      if (ax.time === 'tide') tide++;
      if (ax.space !== 'rooms' || ax.time !== 'turns') odd++;
    }
    expect(odd / N).toBeGreaterThan(0.2);
    expect(caverns / N).toBeGreaterThan(0.15);
    expect(tide / N).toBeGreaterThan(0.1);
  });

  it('a pinned look keeps rooms and turns unless told otherwise, and rolling them disturbs nothing else', () => {
    const w = newWorld(4242, { premise: 'old-stone' });
    expect(w.genome.axioms.space).toBe('rooms');
    expect(w.genome.axioms.time).toBe('turns');
    const rolled = newWorld(4242);
    expect(rolled.variants).toEqual(w.variants);
    expect(rolled.emergence).toEqual(w.emergence);
  });

  it('old worlds keep rooms and turns, and gain a Heart for their first Age', () => {
    const old = { ...newWorld(77, { premise: 'old-stone' }), version: 3, heart: undefined, age: undefined, ages: undefined } as unknown as World;
    const m = migrateWorld(old);
    expect(m.genome.axioms.space).toBe('rooms');
    expect(m.genome.axioms.time).toBe('turns');
    expect(m.age).toBe(1);
    expect(m.heart).toBe(rollHeart(77, 1));
  });
});

describe('Caverns', () => {
  const caves = (seed: number, depth: number, halls = true) => generateLayout(seed, depth, { halls, sprawl: false, caverns: true });

  it('is one connected cave with its stairs, shrine and arrival on open ground', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = caves(seed, 3);
      const open = f.tiles.filter((t) => t !== T_WALL).length;
      expect(open).toBeGreaterThanOrEqual(B.space.caveMinOpen * 0.8);
      const dist = distanceMap(f, f.start);
      for (let i = 0; i < f.tiles.length; i++) if (f.tiles[i] !== T_WALL) expect(dist[i], `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(f.tiles[idx(f, f.stairs.x, f.stairs.y)]).toBe(T_STAIRS);
      expect(f.tiles[idx(f, f.start.x, f.start.y)]).toBe(T_UP);
      expect(f.shrine).toBeTruthy();
      expect(passable(f, f.shrine!.pos.x, f.shrine!.pos.y)).toBe(true);
      expect(f.rooms.length).toBeGreaterThan(3);
    }
  });

  it('looks nothing like rooms and corridors: few straight walls, wide spaces', () => {
    const f = caves(5, 2);
    const r = generateLayout(5, 2, { halls: true, sprawl: false });
    // Count open tiles with all eight neighbours open: caves have far more.
    const wide = (fl: typeof f) => {
      let n = 0;
      for (let y = 1; y < fl.h - 1; y++)
        for (let x = 1; x < fl.w - 1; x++) {
          let all = true;
          for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (!passable(fl, x + dx, y + dy)) all = false;
          if (all) n++;
        }
      return n;
    };
    expect(wide(f)).toBeGreaterThan(wide(r));
  });

  it('a pocket of cave before Halls is part of the whole cave after', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const solo = caves(seed, 2, false);
      const full = caves(seed, 2, true);
      expect(solo.solo).toBe(true);
      for (let i = 0; i < solo.tiles.length; i++) if (solo.tiles[i] !== T_WALL) expect(full.tiles[i]).not.toBe(T_WALL);
      const dist = distanceMap(solo, solo.start);
      expect(dist[idx(solo, solo.stairs.x, solo.stairs.y)]).toBeGreaterThan(0);
      expect(dist[idx(solo, solo.shrine!.pos.x, solo.shrine!.pos.y)]).toBeGreaterThanOrEqual(0);
    }
  });

  it('a caverns world plays: Halls opens the cave, the stairs lead on', () => {
    const g = start(['peril', 'things'], { space: 'caverns' });
    expect(g.run.floor.solo).toBe(true);
    g.adopt('halls', 'shrine');
    expect(g.run.floor.solo).toBeFalsy();
    expect(passable(g.run.floor, g.run.player.x, g.run.player.y)).toBe(true);
    expect(descend(g)).toBe(true);
    expect(g.run.depth).toBe(2);
  });
});

describe('Tide Clock', () => {
  const [s1, s2, s3] = B.time.tideStages;
  const waitTurns = (g: Game, n: number) => {
    for (let i = 0; i < n && !g.run.over; i++) {
      g.run.pending = null;
      g.act({ type: 'wait' });
    }
  };
  /** A tide world on a quiet floor: no foes to interfere, lots of HP. */
  function quiet(rules: RuleId[] = ['peril', 'halls']) {
    const g = start(rules, { time: 'tide' });
    g.run.monsters = [];
    g.run.player.hp = 999;
    return g;
  }

  it('does nothing until foes exist', () => {
    const g = start(['halls'], { time: 'tide' });
    waitTurns(g, s1 + 5);
    expect(g.run.floor.clock ?? 0).toBe(0);
  });

  it('brings more foes at its first mark, sets every foe hunting at its second, and hurts from its third', () => {
    const g = quiet();
    waitTurns(g, s1 - 1);
    expect(g.run.monsters).toHaveLength(0);
    waitTurns(g, 1);
    expect(g.run.floor.tide).toBe(1);
    expect(g.run.monsters.length).toBeGreaterThan(0);
    for (const m of g.run.monsters) {
      m.aware = false;
      m.stun = 9999;
    }
    waitTurns(g, s2 - s1);
    expect(g.run.floor.tide).toBe(2);
    expect(g.run.monsters.every((m) => m.aware)).toBe(true);
    for (const m of g.run.monsters) m.stun = 9999;
    const hp = g.run.player.hp;
    waitTurns(g, s3 - s2 - 1);
    expect(g.run.player.hp).toBe(hp);
    waitTurns(g, B.time.tideHurtEvery * 3);
    expect(g.run.floor.tide).toBe(3);
    expect(g.run.player.hp).toBe(hp - 3);
  });

  it('can end a run, and the epitaph says so', () => {
    const g = quiet();
    waitTurns(g, s3);
    for (const m of g.run.monsters) m.stun = 99999;
    g.run.player.hp = 1;
    waitTurns(g, B.time.tideHurtEvery * 2);
    expect(g.run.over).toBe(true);
    expect(g.run.cause).toBe(g.lex.t('cause.tide', { n: 1 }));
  });

  it('every floor keeps its own clock', () => {
    const g = quiet();
    waitTurns(g, 40);
    expect(g.run.floor.clock).toBe(40);
    descend(g);
    expect(g.run.floor.clock ?? 0).toBe(0);
  });

  it('shows how long until the next mark', () => {
    const g = quiet();
    waitTurns(g, 10);
    expect(sidebarHTML(g, new Set())).toContain(g.lex.t('hud.tide', { n: s1 - 10 }));
  });

  it('turns worlds are untouched', () => {
    const g = start(['peril', 'halls']);
    g.run.monsters = [];
    waitTurns(g, s1 + 5);
    expect(g.run.monsters).toHaveLength(0);
    expect(g.run.floor.clock).toBeUndefined();
  });
});

describe('The Heart', () => {
  it('lies between depth 10 and 20, rolled per world and per Age', () => {
    const depths = new Set<number>();
    for (let s = 1; s <= 300; s++) {
      const w = newWorld(s);
      expect(w.heart).toBeGreaterThanOrEqual(B.heart.depth[0]);
      expect(w.heart).toBeLessThanOrEqual(B.heart.depth[1]);
      depths.add(w.heart!);
      expect(rollHeart(s, 1)).toBe(w.heart);
    }
    expect(depths.size).toBe(B.heart.depth[1] - B.heart.depth[0] + 1);
  });

  it('takes the place of the stairs down on its floor, in rooms and in caves, with Halls or without', () => {
    for (const caverns of [false, true])
      for (const halls of [false, true]) {
        const f = generateLayout(9, 12, { halls, sprawl: false, caverns, heart: true });
        expect(f.heart).toBe(true);
        expect(f.tiles[idx(f, f.stairs.x, f.stairs.y)]).toBe(T_HEART);
        expect(f.tiles.filter((t) => t === T_STAIRS)).toHaveLength(0);
      }
  });

  /** A world whose Heart is on depth 3, so a test can walk there. */
  function nearHeart(rules: RuleId[] = ['peril', 'halls', 'things', 'growth']) {
    const g = start(rules);
    g.world.heart = 3;
    descend(g);
    descend(g);
    return g;
  }

  it('says so when you reach its floor, and when you stand on it', () => {
    const g = nearHeart();
    expect(g.run.depth).toBe(3);
    expect(g.run.floor.heart).toBe(true);
    expect(g.run.log.some((l) => l.text === g.lex.t('heart.near'))).toBe(true);
    const f = g.run.floor;
    g.run.monsters = [];
    const from = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].find(([dx, dy]) => passable(f, f.stairs.x + dx, f.stairs.y + dy))!;
    g.run.player.x = f.stairs.x + from[0];
    g.run.player.y = f.stairs.y + from[1];
    g.run.pending = null;
    g.act({ type: 'move', dx: -from[0], dy: -from[1] });
    expect(g.run.log.some((l) => l.text === g.lex.t('heart.here'))).toBe(true);
    expect(g.run.over).toBe(false);
  });

  it('reaching it ends the run in victory, records the winner, and begins a new Age', () => {
    const g = nearHeart();
    const w = g.world;
    const name = g.run.player.name;
    const rules = [...w.rules];
    expect(descend(g)).toBe(true);
    expect(g.run.over).toBe(true);
    expect(g.run.won).toBe(true);
    expect(g.events.some((e) => e.type === 'victory')).toBe(true);
    expect(g.events.some((e) => e.type === 'death')).toBe(false);
    const last = w.history[w.history.length - 1];
    expect(last).toMatchObject({ name, won: true, depth: 3, age: 1 });
    expect(w.ages).toEqual([expect.objectContaining({ age: 1, name, gen: 1, rules })]);
    expect(w.age).toBe(2);
    expect(w.heart).toBe(rollHeart(w.seed, 2));
    // No grave: nobody died.
    expect(w.graves).toHaveLength(0);
    if (B.heart.newAge === 'rules') expect(w.rules).toEqual([]);
    expect(w.genome.axioms.harm).toBe('strike');
    expect(codexHTML(w, g.lex)).toContain('Age 1');
  });

  it('the next heir is told a new Age has begun', () => {
    const g = nearHeart();
    descend(g);
    const store = new Store(memoryKV());
    store.saveWorld(g.world);
    const next = Game.start(store.world(g.world.id)!);
    const story = next.events.find((e) => e.type === 'story');
    expect(story?.type === 'story' && story.lines[0]).toBe(next.lex.t('age.begin', { age: 2, name: g.run.player.name }));
  });
});

describe('premise words for space, time and the Heart', () => {
  it('every premise names every option, and every Heart is its own', () => {
    for (const p of Object.values(PREMISES)) {
      const L = lexiconOf(p.id);
      for (const s of SPACES) for (const v of Object.values(L.space(s))) expect(v.trim(), `${p.id} ${s}`).toBeTruthy();
      for (const t of TIMES) for (const v of Object.values(L.time(t))) {
        expect(v.trim(), `${p.id} ${t}`).toBeTruthy();
        expect(v, `${p.id} ${t}`).not.toMatch(/\{\w+\}/);
      }
      expect(p.roles.heart).toMatch(/^the /);
    }
    const hearts = ROLLABLE.map((id) => PREMISES[id].roles.heart.toLowerCase());
    expect(new Set(hearts).size).toBe(hearts.length);
    const names = ROLLABLE.flatMap((id) => [PREMISES[id].space.caverns.name, PREMISES[id].time.tide.name].map((n) => n.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });
});
