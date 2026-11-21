import { describe, expect, it } from 'vitest';
import { makeItem } from '../engine/content.ts';
import { Game } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import type { World } from '../engine/types.ts';
import { newWorld, rollLook } from '../engine/world.ts';
import { RULE_ORDER } from '../rules/rules.ts';
import { BASE_TEXT, BUNDLES, ROLE_KEYS, type BundleId, type MessageKey } from '../theme/base.ts';
import { lexiconFor, lexiconOf, placeholders, PREMISES, ROLLABLE, withMeans } from '../theme/lexicon.ts';
import { HARMS } from '../rules/harm.ts';
import { OLD_STONE } from '../theme/old-stone.ts';
import { PLAIN } from '../theme/plain.ts';
import type { PremiseId } from '../theme/premise.ts';

const BUILTIN = new Set<string>([...ROLE_KEYS, 'ember', 'frost', 'foes_rat', 'foes_bat', 'foes_goblin', 'foes_slime']);
const isBuiltin = (ph: string) => BUILTIN.has(ph) || BUILTIN.has(ph[0].toLowerCase() + ph.slice(1));
function callVars(key: MessageKey): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of [BASE_TEXT[key], OLD_STONE.text[key] ?? '']) for (const ph of placeholders(t)) if (!isBuiltin(ph)) out[ph] = `<${ph}>`;
  return out;
}
const BUNDLE_IDS = Object.keys(BUNDLES) as BundleId[];
const HOSTS = ROLLABLE.filter((id) => !PREMISES[id].pure);

describe('rolling a world', () => {
  const N = 3000;
  const looks = Array.from({ length: N }, (_, i) => rollLook(i + 1));

  it('rolls every themed premise, and The Old Stone only rarely', () => {
    const counts = new Map<PremiseId, number>();
    for (const l of looks) counts.set(l.premise, (counts.get(l.premise) ?? 0) + 1);
    for (const id of ROLLABLE) expect(counts.get(id) ?? 0, id).toBeGreaterThan(0);
    expect(counts.get('plain') ?? 0).toBe(0);
    const old = (counts.get('old-stone') ?? 0) / N;
    expect(old).toBeLessThan(0.06);
    for (const id of HOSTS) expect((counts.get(id) ?? 0) / N, id).toBeGreaterThan(0.1);
  });

  it('borrows distinct bundles from other rollable premises, and the pure one never borrows', () => {
    let none = 0;
    for (const { premise, intrusions } of looks) {
      if (!intrusions.length) none++;
      expect(intrusions.length).toBeLessThanOrEqual(2);
      expect(new Set(intrusions.map((i) => i.bundle)).size).toBe(intrusions.length);
      for (const i of intrusions) {
        expect(i.from).not.toBe(premise);
        expect(ROLLABLE).toContain(i.from);
      }
      if (PREMISES[premise].pure) expect(intrusions).toEqual([]);
    }
    expect(none / N).toBeGreaterThan(0.4);
    expect(none / N).toBeLessThan(0.65);
  });

  it('is deterministic, and the look does not disturb the rest of the world', () => {
    const a = newWorld(4242);
    const b = newWorld(4242);
    expect(a.genome).toEqual(b.genome);
    expect(a.name).toBe(b.name);
    const pinned = newWorld(4242, { premise: 'old-stone' });
    expect(pinned.variants).toEqual(a.variants);
    expect(pinned.emergence).toEqual(a.emergence);
  });

  it('names the world in its premise’s grammar', () => {
    for (let s = 1; s < 60; s++) {
      const w = newWorld(s);
      const n = PREMISES[w.genome.premise].naming;
      expect(n.worldAdjectives.some((adj) => w.name.includes(adj)), w.name).toBe(true);
      expect(n.worldNouns.some((noun) => w.name.includes(noun)), w.name).toBe(true);
    }
  });
});

describe('intrusions', () => {
  it('a borrowed bundle speaks the donor’s words and keeps the host’s everywhere else', () => {
    const lex = lexiconOf('merger', [{ bundle: 'foes', from: 'tidepool' }]);
    expect(lex.foe('rat').name).toBe(PREMISES.tidepool.foes.rat.name);
    expect(lex.role('foes')).toBe(PREMISES.tidepool.roles.foes);
    expect(lex.t('foe.dies', { foe: 'x' })).toBe(lexiconOf('tidepool').t('foe.dies', { foe: 'x' }));
    expect(lex.role('restorative')).toBe(PREMISES.merger.roles.restorative);
    expect(lex.t('stairs.descend', { n: 2 })).toBe(lexiconOf('merger').t('stairs.descend', { n: 2 }));
  });

  it('borrowed items are named by the donor', () => {
    const lex = lexiconOf('ministry', [{ bundle: 'arms', from: 'night-shift' }]);
    const g = { rng: new Rng(1), ctx: { rules: new Set(RULE_ORDER), variants: {} }, lex, nextId: () => 1 } as never;
    const w = makeItem('weapon', 3, g);
    expect(PREMISES['night-shift'].items.weapons).toContain(lex.itemName(w));
  });

  // No host line may still name a thing its world borrowed from elsewhere:
  // a Merger full of crabs mustn't say "interns pour out of the stairwell".
  it('no host line names what was borrowed, under any means of harm', { timeout: 60_000 }, () => {
    const problems: string[] = [];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const harm of HARMS) for (const host of HOSTS) {
      const hp = withMeans(PREMISES[host], harm);
      // Rule names are the host's own, borrowed bundle or not, and are quoted inside other rules' texts.
      const ruleNames = [
        ...RULE_ORDER.flatMap((r) => [lexiconOf(host).rule(r).name, lexiconOf(host).rule(r).variant.name]),
        ...HARMS.map((h) => hp.means[h].name),
      ];
      const unquote = (t: string) => ruleNames.reduce((s, n) => s.split(n).join('§'), t);
      for (const bundle of BUNDLE_IDS) {
        const b = BUNDLES[bundle];
        const words = new Set<string>();
        for (const r of b.roles) words.add(hp.roles[r]);
        for (const it of b.items) [hp.items[it as keyof typeof hp.items]].flat().forEach((w) => words.add(w as string));
        if ('foes' in b && b.foes) for (const f of Object.values(hp.foes)) words.add(f.name).add(f.plural);
        // A word the host also uses for something it keeps is fair game.
        const kept = Object.entries(hp.roles).filter(([k]) => !(b.roles as readonly string[]).includes(k)).map(([, v]) => v.toLowerCase());
        const check = [...words].filter((w) => !kept.includes(w.toLowerCase()));
        for (const donor of ROLLABLE) {
          if (donor === host) continue;
          const lex = lexiconOf(host, [{ bundle, from: donor }], false, harm);
          const texts: [string, string][] = (Object.keys(BASE_TEXT) as MessageKey[])
            .filter((k) => !(b.text as readonly string[]).includes(k))
            .map((k) => [k, lex.t(k, callVars(k))]);
          for (const r of RULE_ORDER) {
            const t = lex.rule(r);
            texts.push([`rule ${r}`, [t.tagline, t.summary, t.upside, t.downside, t.variant.text, t.earned ?? '', t.imposed ?? ''].join(' | ')]);
          }
          const m = lex.means(harm);
          texts.push([`means ${harm}`, [m.tagline, m.summary, m.upside, m.downside].join(' | ')]);
          for (const [k, t] of texts) {
            for (const w of check) if (new RegExp(`\\b${esc(w)}\\b`, 'i').test(unquote(t))) problems.push(`${harm}: ${host}+${bundle} from ${donor}: ${k} says "${w}"`);
          }
        }
      }
    }
    expect([...new Set(problems.map((p) => p.replace(/ from [\w-]+/, '')))]).toEqual([]);
  });

  it('each heir hears where the borrowed things came from', () => {
    const w = newWorld(9, { premise: 'tidepool', intrusions: [{ bundle: 'currency', from: 'merger' }] });
    const g = Game.start(w);
    const line = g.run.log.map((l) => l.text).find((t) => t.includes(PREMISES.merger.name));
    expect(line).toBeTruthy();
    expect(line).toContain(PREMISES.tidepool.seep);
    expect(line).toContain(PREMISES.merger.roles.currency);
  });
});

describe('Plain labels and glosses', () => {
  const world = (premise: PremiseId, intrusions: World['genome']['intrusions'] = []) => newWorld(31, { premise, intrusions });

  it('plain labels speak The Plain, drawn in the world’s glyphs and colours', () => {
    const w = world('court-of-barbs');
    const lex = lexiconFor(w, true);
    expect(lex.plain).toBe(true);
    expect(lex.role('hp')).toBe(PLAIN.roles.hp);
    expect(lex.foe('goblin').name).toBe(PLAIN.foes.goblin.name);
    expect(lex.foe('goblin').glyph).toBe(PREMISES['court-of-barbs'].foes.goblin.glyph);
    expect(lex.element('ember').color).toBe(PREMISES['court-of-barbs'].elements.ember.color);
    expect(lex.floorName(w.seed, 2)).toBeNull();
  });

  it('item names follow the toggle, by key', () => {
    const w = world('overgrown-choir');
    const g = Game.start(w);
    const item = makeItem('armor', 2, { rng: new Rng(3), ctx: g.ctx, lex: g.lex, nextId: () => 1 } as never);
    expect(PREMISES['overgrown-choir'].items.armors).toContain(g.lex.itemName(item));
    expect(PLAIN.items.armors).toContain(lexiconFor(w, true).itemName(item));
  });

  it('a game can switch its labels mid-run', () => {
    const w = world('night-shift');
    const g = Game.start(w, true);
    expect(g.lex.plain).toBe(true);
    g.lex = lexiconFor(w);
    expect(g.lex.role('hp')).toBe(PREMISES['night-shift'].roles.hp);
  });

  it('glosses name the mechanic beside a themed word, and stay quiet otherwise', () => {
    const merger = lexiconOf('merger');
    expect(merger.ruleGloss('peril')).toBe(lexiconOf('plain').rule('peril').name);
    expect(merger.foeGloss('rat')).toBe(PLAIN.foes.rat.name);
    expect(merger.roleGloss('hp')).toBe(PLAIN.roles.hp);
    const w = makeItem('potion', 1, { rng: new Rng(1), ctx: { rules: new Set(), variants: {} }, lex: merger, nextId: () => 1 } as never);
    expect(merger.itemGloss(w)).toBe(PLAIN.items.restorative);
    // The classic words and Plain mode need no gloss.
    const old = lexiconOf('old-stone');
    for (const r of RULE_ORDER) expect(old.ruleGloss(r), r).toBeNull();
    expect(old.foeGloss('rat')).toBeNull();
    expect(old.itemGloss(w)).toBeNull();
    const plain = lexiconOf('merger', [], true);
    expect(plain.ruleGloss('peril')).toBeNull();
    expect(plain.foeGloss('slime')).toBeNull();
  });
});

describe('putting the story up front', () => {
  it('a new world opens with its premise and its first room, to read before going on', () => {
    const w = newWorld(77, { premise: 'tidepool', intrusions: [{ bundle: 'foes', from: 'merger' }] });
    const g = Game.start(w);
    const story = g.events.find((e) => e.type === 'story');
    expect(story).toBeTruthy();
    if (story?.type !== 'story') return;
    expect(story.title).toBe(w.name);
    expect(story.lines[0]).toBe(PREMISES.tidepool.pitch);
    expect(story.lines.some((l) => l.includes(PREMISES.merger.name))).toBe(true);
  });

  it('an heir opens with where they are, and what they inherit', () => {
    const w = newWorld(78, { premise: 'ministry' });
    w.rules = ['peril', 'halls'];
    const g = Game.start(w);
    const story = g.events.find((e) => e.type === 'story');
    expect(story?.type === 'story' && story.title).toBe(g.run.player.name);
  });

  it('a kill is flashed on screen as well as logged', () => {
    const w = newWorld(79, { premise: 'merger', harm: 'strike' });
    w.rules = ['peril'];
    const g = Game.start(w);
    g.events.splice(0);
    const p = g.run.player;
    const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ dx, dy })).find(({ dx, dy }) => g.run.floor.tiles[(p.y + dy) * g.run.floor.w + p.x + dx] !== 0)!;
    g.run.monsters = [{ id: 1, kind: 'rat', x: p.x + spot.dx, y: p.y + spot.dy, hp: 1, maxHp: 1, atk: 0, def: 0, xp: 1, aware: true, stun: 9, element: null }];
    g.act({ type: 'move', dx: spot.dx, dy: spot.dy });
    const say = g.events.find((e) => e.type === 'say');
    expect(say?.type === 'say' && say.text).toBe(g.run.log.find((l) => l.tone === 'good')?.text);
  });
});

describe('floor names', () => {
  it('are deterministic, walk the premise’s list in order, and wrap', () => {
    const lex = lexiconOf('ministry');
    const floors = PREMISES.ministry.naming.floors;
    expect(floors.length).toBeGreaterThan(0);
    expect(lex.floorName(5, 1)).toBe(lex.floorName(5, 1));
    expect(lex.floorName(5, 2)).toBe(floors[(5 + 1) % floors.length]);
    expect(lex.floorName(5, 1 + floors.length)).toBe(lex.floorName(5, 1));
  });

  it('every themed premise names its floors, and The Old Stone does not', () => {
    for (const id of HOSTS) expect(PREMISES[id].naming.floors.length, id).toBeGreaterThanOrEqual(8);
    expect(lexiconOf('old-stone').floorName(1, 1)).toBeNull();
  });
});
