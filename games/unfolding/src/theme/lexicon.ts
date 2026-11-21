import { BALANCE } from '../engine/balance.ts';
import type { Element, Item, MonsterKind, RuleId, SpaceId, TimeId, World } from '../engine/types.ts';
import type { HarmId } from '../rules/harm.ts';
import { BASE_MEANS_RULE, BASE_MEANS_TEXT, BASE_RULE_TEXT, BASE_TEXT, BUNDLES, type BundleId, type MessageKey } from './base.ts';
import { OLD_STONE } from './old-stone.ts';
import { PLAIN } from './plain.ts';
import type { AxiomWords, ElementLook, FoeLook, MeansText, Premise, PremiseId, RuleText } from './premise.ts';
import { COURT_OF_BARBS } from './premises/court-of-barbs.ts';
import { MERGER } from './premises/merger.ts';
import { MINISTRY } from './premises/ministry.ts';
import { NIGHT_SHIFT } from './premises/night-shift.ts';
import { OVERGROWN_CHOIR } from './premises/overgrown-choir.ts';
import { TIDEPOOL } from './premises/tidepool.ts';

export type Vars = Record<string, string | number>;

export const PREMISES: Record<PremiseId, Premise> = {
  'old-stone': OLD_STONE,
  plain: PLAIN,
  merger: MERGER,
  'overgrown-choir': OVERGROWN_CHOIR,
  'court-of-barbs': COURT_OF_BARBS,
  tidepool: TIDEPOOL,
  ministry: MINISTRY,
  'night-shift': NIGHT_SHIFT,
};

export const DEFAULT_PREMISE: PremiseId = 'old-stone';

/** Premises a new world can roll, with their weights. */
export const ROLLABLE: PremiseId[] = (Object.keys(PREMISES) as PremiseId[]).filter((id) => PREMISES[id].weight > 0);

/** A bundle of role words, names and lines borrowed from another premise. */
export interface Intrusion {
  bundle: BundleId;
  from: PremiseId;
}

/**
 * Numbers rule texts may quote, taken from balance so the words never drift
 * from the behaviour.
 */
export const RULE_TEXT_VARS: Vars = {
  baseHp: BALANCE.player.hp,
  frailHp: BALANCE.player.frailHp,
  wildfireBurn: BALANCE.elements.wildfireBurn,
  emberBurn: BALANCE.elements.emberBurn,
  regenPct: Math.round(BALANCE.hunger.regenAbove * 100),
  regenEvery: BALANCE.hunger.regenEvery,
  starveEvery: BALANCE.hunger.starveEvery,
  cleaveCost: BALANCE.arcana.cleaveCost,
  mendCost: BALANCE.arcana.mendCost,
  mendPct: Math.round(BALANCE.arcana.mendFraction * 100),
  volleyRange: BALANCE.harm.volleyRange,
  arcanumRange: BALANCE.harm.arcanumRange,
  earshot: BALANCE.harm.earshot,
  tide1: BALANCE.time.tideStages[0],
  tide2: BALANCE.time.tideStages[1],
  tide3: BALANCE.time.tideStages[2],
  tideHurtEvery: BALANCE.time.tideHurtEvery,
  driftEvery: BALANCE.space.driftEvery,
  boltCost: BALANCE.harm.boltCost,
  startAmmo: BALANCE.harm.startAmmo,
  strikeGuard: BALANCE.harm.strikeGuard,
  volleyPower: Math.round(BALANCE.harm.power.volley * 100),
  arcanumPower: Math.round(BALANCE.harm.power.arcanum * 100),
  discoursePower: Math.round(BALANCE.harm.power.discourse * 100),
};

const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "a" or "an" for a word (English: by its first letter). */
export const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/**
 * Replace {name} placeholders. {Name} capitalises {name}'s value when only the
 * lower-case form is given; {a:name} and {A:name} put "a"/"an" in front of it.
 * An unknown placeholder is left visible, and the premise tests catch it.
 */
export function fill(template: string, vars: Vars = {}): string {
  const value = (k: string): string | undefined => {
    if (k in vars) return String(vars[k]);
    const lower = k[0].toLowerCase() + k.slice(1);
    if (lower !== k && lower in vars) return capFirst(String(vars[lower]));
    return undefined;
  };
  return template.replace(/\{(?:(a|A):)?(\w+)\}/g, (whole, art: string | undefined, k: string) => {
    const v = value(k);
    if (v === undefined) return whole;
    if (!art) return v;
    const a = article(v);
    return `${art === 'A' ? capFirst(a) : a} ${v}`;
  });
}

/** Every {placeholder} a template uses (without any a: prefix). */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(?:[aA]:)?(\w+)\}/g)].map((m) => m[1]);
}

/**
 * A premise as it speaks under one Means of Harm: the means' role words,
 * implement names and lines laid over its own. Strike changes nothing.
 */
export function withMeans(p: Premise, harm: HarmId): Premise {
  if (harm === 'strike') return p;
  const m = p.means[harm];
  return {
    ...p,
    roles: { ...p.roles, ...m.roles },
    items: { ...p.items, weapons: m.weapons ?? p.items.weapons },
    text: { ...p.text, ...BASE_MEANS_TEXT[harm], ...m.text },
  };
}

/** A premise with borrowed bundles folded in (each donor speaking under the same means). */
export function compose(base: Premise, intrusions: readonly Intrusion[] = [], harm: HarmId = 'strike'): Premise {
  base = withMeans(base, harm);
  if (!intrusions.length) return base;
  const out: Premise = {
    ...base,
    roles: { ...base.roles },
    items: { ...base.items },
    text: { ...base.text },
    foes: { ...base.foes },
  };
  for (const { bundle, from } of intrusions) {
    const donor = withMeans(PREMISES[from], harm);
    const b = BUNDLES[bundle];
    for (const r of b.roles) out.roles[r] = donor.roles[r];
    for (const it of b.items) (out.items as Record<string, unknown>)[it] = donor.items[it as keyof Premise['items']];
    for (const k of b.text) {
      const line = donor.text[k as MessageKey];
      if (line !== undefined) (out.text as Record<string, string>)[k] = line;
    }
    if ('foes' in b && b.foes) out.foes = { ...donor.foes };
  }
  return out;
}

/** The words of one world: what every role, rule and message is called there. */
export class Lexicon {
  readonly premise: Premise;
  /** Speaking The Plain words in place of the world's own (the Plain labels option). */
  readonly plain: boolean;
  /** Role words, element words and foe plurals, available to every template. */
  private builtins: Vars;
  private ruleCache = new Map<RuleId, RuleText>();

  constructor(premise: Premise, plain = false) {
    this.premise = premise;
    this.plain = plain;
    const b: Vars = { ...premise.roles };
    for (const el of ['ember', 'frost'] as Element[]) b[el] = premise.elements[el].adj;
    for (const [kind, f] of Object.entries(premise.foes)) b[`foes_${kind}`] = f.plural;
    this.builtins = b;
  }

  /** A message or label, filled in. */
  t(key: MessageKey, vars?: Vars): string {
    const template = this.premise.text[key] ?? BASE_TEXT[key];
    return fill(template, vars ? { ...this.builtins, ...vars } : this.builtins);
  }

  /** A role word: what this world calls HP, currency, stairs… */
  role(key: keyof Premise['roles']): string {
    return this.premise.roles[key];
  }

  /** A rule's name and texts in this world, with balance numbers filled in. */
  rule(id: RuleId): RuleText {
    let r = this.ruleCache.get(id);
    if (!r) {
      const words = this.premise.rules[id];
      const base = BASE_RULE_TEXT[id];
      const vars: Vars = { ...this.builtins, ...RULE_TEXT_VARS };
      for (const [rid, w] of Object.entries(this.premise.rules)) vars[`r_${rid}`] = w.name;
      const f = (s: string) => fill(s, vars);
      const earned = words.earned ?? base.earned;
      const imposed = words.imposed ?? base.imposed;
      r = {
        name: f(words.name),
        tagline: f(words.tagline),
        summary: f(words.summary),
        upside: f(words.upside ?? base.upside),
        downside: f(words.downside ?? base.downside),
        earned: earned && f(earned),
        imposed: imposed && f(imposed),
        variant: { name: f(words.variant), text: f(words.variantText ?? base.variant) },
      };
      this.ruleCache.set(id, r);
    }
    return r;
  }

  foe(kind: MonsterKind): FoeLook {
    return this.premise.foes[kind];
  }

  element(el: Element): ElementLook {
    return this.premise.elements[el];
  }

  /** What an item is called in this world: by its genotype key when it has one. */
  itemName(item: Pick<Item, 'name' | 'key'>): string {
    const key = item.key;
    if (!key) return item.name;
    const [kind, i] = key.split(':');
    const items = this.premise.items;
    if (kind === 'potion') return items.restorative;
    if (kind === 'gold') return items.currency;
    const list = kind === 'food' ? items.foods : kind === 'weapon' ? items.weapons : kind === 'armor' ? items.armors : null;
    return list?.[Number(i)] ?? item.name;
  }

  /** The name of a floor at this depth in this world, if the premise names floors. */
  floorName(seed: number, depth: number): string | null {
    const floors = this.premise.naming.floors;
    if (!floors.length) return null;
    // Deeper floors walk through the list in order, starting at a world-specific offset.
    return floors[(seed + depth - 1) % floors.length];
  }

  // Glosses: the mechanical word for a themed thing, shown small beside it, so a
  // player can tell an intern is just a common foe. None when labels are
  // already plain, or when the themed word is the plain or the classic one.

  private gloss(themed: string, plainWord: string, classic: string): string | null {
    const t = themed.toLowerCase();
    return this.plain || t === plainWord.toLowerCase() || t === classic.toLowerCase() ? null : plainWord;
  }

  /** A gloss for any themed name, against its plain one (the classic word is the plain one here). */
  ruleGlossOf(themed: string, plainWord: string): string | null {
    return this.gloss(themed, plainWord, plainWord);
  }

  ruleGloss(id: RuleId): string | null {
    return this.gloss(this.rule(id).name, lexiconOf('plain').rule(id).name, lexiconOf(DEFAULT_PREMISE).rule(id).name);
  }

  roleGloss(key: keyof Premise['roles']): string | null {
    return this.gloss(this.role(key), PLAIN.roles[key], OLD_STONE.roles[key]);
  }

  foeGloss(kind: MonsterKind): string | null {
    return this.gloss(this.foe(kind).name, PLAIN.foes[kind].name, OLD_STONE.foes[kind].name);
  }

  itemGloss(item: Pick<Item, 'name' | 'key'>): string | null {
    if (!item.key) return null;
    return this.gloss(this.itemName(item), lexiconOf('plain').itemName(item), lexiconOf(DEFAULT_PREMISE).itemName(item));
  }

  /** A Means of Harm in this world's words, with its mechanics spelled out. */
  means(id: HarmId): MeansText {
    const words = this.premise.means[id];
    const vars: Vars = { ...this.builtins, ...RULE_TEXT_VARS };
    const f = (s: string) => fill(s, vars);
    return {
      name: f(words.name),
      tagline: f(words.tagline),
      summary: f(words.summary),
      upside: f(BASE_MEANS_RULE[id].upside),
      downside: f(BASE_MEANS_RULE[id].downside),
    };
  }

  /** Shape of Space in this world's words. */
  space(id: SpaceId): AxiomWords {
    return this.axiomWords(this.premise.space[id]);
  }

  /** Flow of Time in this world's words. */
  time(id: TimeId): AxiomWords {
    return this.axiomWords(this.premise.time[id]);
  }

  private axiomWords(w: AxiomWords): AxiomWords {
    const vars: Vars = { ...this.builtins, ...RULE_TEXT_VARS };
    return { name: fill(w.name, vars), tagline: fill(w.tagline, vars), summary: fill(w.summary, vars) };
  }

  /** "a, b and c" in this premise's words. */
  list(parts: string[]): string {
    if (parts.length <= 1) return parts.join('');
    return this.t('list.and', { rest: parts.slice(0, -1).join(this.t('list.sep')), last: parts[parts.length - 1] });
  }

  /** "1 turn" / "N turns". */
  turns(n: number): string {
    return n === 1 ? this.t('turns.one') : this.t('turns.many', { n });
  }
}

const cache = new Map<string, Lexicon>();

/** A lexicon for a premise, with optional intrusions; `plain` swaps in The Plain words but keeps the world's look. */
export function lexiconOf(id: PremiseId, intrusions: readonly Intrusion[] = [], plain = false, harm: HarmId = 'strike'): Lexicon {
  const key = `${id}|${intrusions.map((i) => `${i.bundle}:${i.from}`).join(',')}|${plain}|${harm}`;
  let lex = cache.get(key);
  if (!lex) {
    const world = compose(PREMISES[id] ?? PREMISES[DEFAULT_PREMISE], intrusions, harm);
    lex = plain ? new Lexicon(plainWords(world, harm), true) : new Lexicon(world);
    cache.set(key, lex);
  }
  return lex;
}

/** The Plain vocabulary, but drawn with this world's glyphs and colours. */
function plainWords(world: Premise, harm: HarmId): Premise {
  const PLAIN_HERE = withMeans(PLAIN, harm);
  const foes = { ...PLAIN.foes };
  for (const k of Object.keys(foes) as MonsterKind[]) foes[k] = { ...PLAIN.foes[k], glyph: world.foes[k].glyph, color: world.foes[k].color };
  const elements = { ...PLAIN.elements };
  for (const el of ['ember', 'frost'] as Element[]) {
    elements[el] = { ...world.elements[el], adj: PLAIN.elements[el].adj, Adj: PLAIN.elements[el].Adj };
  }
  return { ...PLAIN_HERE, id: world.id, name: world.name, pitch: world.pitch, tiles: world.tiles, foes, elements, naming: { ...world.naming, floors: [] } };
}

/** The lexicon a world speaks in. */
export function lexiconFor(world: Pick<World, 'genome'>, plain = false, harm?: HarmId): Lexicon {
  return lexiconOf(world.genome?.premise ?? DEFAULT_PREMISE, world.genome?.intrusions ?? [], plain, harm ?? world.genome?.axioms.harm ?? 'strike');
}
