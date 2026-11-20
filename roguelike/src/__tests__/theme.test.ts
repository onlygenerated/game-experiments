import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE } from '../engine/balance.ts';
import { ARMORS, WEAPONS } from '../engine/content.ts';
import { Game } from '../engine/game.ts';
import type { RuleId, World } from '../engine/types.ts';
import { memoryKV, migrateWorld, newWorld, Store, WORLD_VERSION } from '../engine/world.ts';
import { eligible, frontier, repealable, RULE_ORDER, RULES } from '../rules/rules.ts';
import { BASE_TEXT, ROLE_KEYS, THEMED_KEYS, type MessageKey } from '../theme/base.ts';
import { fill, lexiconFor, lexiconOf, placeholders, PREMISES, ROLLABLE } from '../theme/lexicon.ts';
import { OLD_STONE } from '../theme/old-stone.ts';
import type { PremiseId } from '../theme/premise.ts';

/** Call-site values a message may use: whatever its base or Old Stone template uses that isn't a built-in. */
const BUILTIN = new Set<string>([...ROLE_KEYS, 'ember', 'frost', 'foes_rat', 'foes_bat', 'foes_goblin', 'foes_slime']);
const isBuiltin = (ph: string) => BUILTIN.has(ph) || BUILTIN.has(ph[0].toLowerCase() + ph.slice(1));
function callVars(key: MessageKey): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of [BASE_TEXT[key], OLD_STONE.text[key] ?? '']) for (const ph of placeholders(t)) if (!isBuiltin(ph)) out[ph] = `<${ph}>`;
  return out;
}
const THEMED = (Object.keys(PREMISES) as PremiseId[]).filter((id) => id !== 'old-stone' && id !== 'plain');

describe('premise data', () => {
  for (const premise of Object.values(PREMISES)) {
    describe(premise.name, () => {
      const lex = lexiconOf(premise.id);

      it('says every message with nothing left unfilled', () => {
        for (const key of Object.keys(BASE_TEXT) as MessageKey[]) {
          const out = lex.t(key, callVars(key));
          expect(out, key).not.toMatch(/\{\w+\}/);
          expect(out.trim(), key).not.toBe('');
        }
      });

      it('writes its own signature lines, using only values the game passes', () => {
        if (premise.id === 'plain' || premise.id === 'old-stone') return;
        for (const key of THEMED_KEYS) {
          const template = premise.text[key];
          expect(template?.trim(), key).toBeTruthy();
          const allowed = new Set(Object.keys(callVars(key)));
          for (const ph of placeholders(template)) expect(allowed.has(ph) || isBuiltin(ph), `${premise.id} ${key} uses {${ph}}`).toBe(true);
        }
      });

      it('names every rule, with every text filled', () => {
        for (const id of RULE_ORDER) {
          const r = lex.rule(id);
          const all = [r.name, r.tagline, r.summary, r.upside, r.downside, r.variant.name, r.variant.text, r.earned ?? '', r.imposed ?? ''];
          for (const s of all) expect(s, `${premise.id} ${id}`).not.toMatch(/\{\w+\}/);
          expect(r.name.trim()).not.toBe('');
          if (RULES[id].imposed) expect(r.imposed, `${id} is imposed`).toBeTruthy();
        }
      });

      it('has a word for every role and a name for every generated thing', () => {
        for (const k of ROLE_KEYS) expect(premise.roles[k]?.trim(), k).toBeTruthy();
        expect(premise.items.weapons).toHaveLength(WEAPONS.length);
        expect(premise.items.armors).toHaveLength(ARMORS.length);
        expect(premise.items.foods).toHaveLength(BALANCE.food.kinds.length);
        for (const n of [...premise.items.weapons, ...premise.items.armors, ...premise.items.foods, premise.items.restorative, premise.items.currency]) {
          expect(n.trim()).not.toBe('');
        }
        for (const f of Object.values(premise.foes)) expect(f.plural.trim()).toBeTruthy();
        expect(premise.naming.heirs.length).toBeGreaterThan(0);
        expect(placeholders(premise.naming.world).sort()).toEqual(['adj', 'noun']);
      });

      it('gives foes and hazards distinct glyphs', () => {
        const foes = Object.values(premise.foes).map((f) => f.glyph);
        expect(new Set(foes).size).toBe(foes.length);
        // Foes must not look like the player, stairs, shrine, graves or items.
        for (const g of foes) expect('@<>Ω†!$)[%'.includes(g), g).toBe(false);
        expect(premise.elements.ember.glyph).not.toBe(premise.elements.frost.glyph);
      });
    });
  }

  it('fill leaves unknown placeholders visible, and capitalises on request', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(fill('{Foes} meet {foes}', { foes: 'interns' })).toBe('Interns meet interns');
  });
});

describe('worlds look nothing alike', () => {
  /** Every noun a world shows: role words, foe and item names, rule and variant names. */
  function nouns(id: PremiseId): Set<string> {
    const p = PREMISES[id];
    const lex = lexiconOf(id);
    const out = [
      ...Object.values(p.roles),
      ...Object.values(p.foes).flatMap((f) => [f.name, f.plural]),
      p.items.restorative,
      p.items.currency,
      ...p.items.foods,
      ...p.items.weapons,
      ...p.items.armors,
      ...RULE_ORDER.flatMap((r) => [lex.rule(r).name, lex.rule(r).variant.name]),
      p.elements.ember.adj,
      p.elements.frost.adj,
    ];
    return new Set(out.map((s) => s.toLowerCase()));
  }
  const rollable = ROLLABLE;

  it('no two rollable worlds share a noun', () => {
    for (const a of rollable) {
      for (const b of rollable) {
        if (a >= b) continue;
        const shared = [...nouns(a)].filter((n) => nouns(b).has(n));
        expect(shared, `${a} and ${b}`).toEqual([]);
      }
    }
  });

  it('no Old Stone words leak into a themed world', () => {
    const signature = /\b(rats?|bats?|goblins?|slimes?|potions?|gold|dagger|sword|greatsword|maul|plate|chain mail|leather|ration|dried meat)\b/i;
    for (const id of THEMED) {
      const lex = lexiconOf(id);
      for (const key of Object.keys(BASE_TEXT) as MessageKey[]) expect(lex.t(key, callVars(key)), `${id} ${key}`).not.toMatch(signature);
      for (const r of RULE_ORDER) expect(JSON.stringify(lex.rule(r)), `${id} ${r}`).not.toMatch(signature);
    }
  });
});

describe('no player-visible text in the engine', () => {
  // Engine and rules files may hold ids, keys and comments, but never prose a
  // player could read: that belongs to a premise.
  const dirs = ['src/engine', 'src/rules'];
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`));

  it('has no sentence-like string literals', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
        const body = m[2];
        if (/^\s*import\b/.test(body) || body.includes('${')) continue;
        // Prose: two or more words of letters separated by spaces.
        if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(body)) offenders.push(`${file}: ${body}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('world genome and the rule graph', () => {
  const original = { ...RULES.weight };
  const originalDur = { ...RULES.durability };
  afterEach(() => {
    Object.assign(RULES.weight, original);
    RULES.weight.group = original.group;
    Object.assign(RULES.durability, originalDur);
    RULES.durability.group = originalDur.group;
  });

  it('new worlds carry a genome', () => {
    const w = newWorld(5, { premise: 'old-stone' });
    expect(w.version).toBe(WORLD_VERSION);
    expect(w.genome).toEqual({
      premise: 'old-stone',
      intrusions: [],
      axioms: { harm: 'strike', space: 'rooms', time: 'turns', self: 'single', knowledge: 'plain' },
      pool: null,
    });
    expect(lexiconFor(w).premise).toBe(OLD_STONE);
  });

  it('exclusive groups: one member per world, and never repealed', () => {
    RULES.weight.group = 'test-family';
    RULES.durability.group = 'test-family';
    const active = new Set<RuleId>(['peril', 'things', 'arms', 'weight']);
    expect(eligible('durability', active)).toBe(false);
    expect(frontier(active)).not.toContain('durability');
    expect(repealable(active)).not.toContain('weight');
    expect(frontier(new Set<RuleId>(['peril', 'things', 'arms']))).toEqual(expect.arrayContaining(['weight', 'durability']));
  });

  it('a world can only discover rules in its pool', () => {
    const active = new Set<RuleId>(['peril', 'things', 'arms']);
    const pool: RuleId[] = ['halls', 'peril', 'things', 'arms', 'weight'];
    const f = frontier(active, { depth: 99, emergence: {}, pool });
    expect(f).toContain('weight');
    expect(f).not.toContain('durability');
    expect(f).not.toContain('growth');
  });

  it('imposed rules respect the pool too', () => {
    const world = newWorld(12);
    world.rules = ['peril', 'halls', 'growth'];
    world.emergence.bestiary = 2;
    world.genome.pool = RULE_ORDER.filter((r) => r !== 'bestiary');
    const g = Game.start(world);
    g.run.player.x = g.run.floor.stairs.x;
    g.run.player.y = g.run.floor.stairs.y;
    g.act({ type: 'descend' });
    expect(world.rules).not.toContain('bestiary');
  });

  it('v2 worlds gain a default genome and keep everything else', () => {
    const v2 = { ...newWorld(77, { premise: 'old-stone' }), version: 2 } as Partial<World>;
    delete v2.genome;
    const m = migrateWorld(v2 as World);
    expect(m.version).toBe(WORLD_VERSION);
    expect(m.genome.premise).toBe('old-stone');
    expect(m.rules).toEqual(v2.rules);
    expect(m.name).toBe(v2.name);
  });

  it('migrates worlds as they are read from storage', () => {
    const kv = memoryKV();
    const v2 = { ...newWorld(78, { premise: 'old-stone' }), version: 2 } as Partial<World>;
    delete v2.genome;
    kv.setItem('unfolding.worlds.v1', JSON.stringify([v2]));
    const [w] = new Store(kv).worlds();
    expect(w.genome.premise).toBe('old-stone');
    // And a run resumed in it still speaks The Old Stone.
    const g = Game.start(w);
    expect(g.lex.premise).toBe(OLD_STONE);
  });
});
