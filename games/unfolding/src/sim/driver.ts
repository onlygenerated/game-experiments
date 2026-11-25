/**
 * The branch simulator's engine side. It drives a real Game with real actions
 * (every step is a `game.act` call), but replaces walking around with
 * intents: "go answer the shrine", "fight that foe", "take the stairs". The
 * walking still happens, step by step, so foes still close in, clocks still
 * tick and floors still drift; you just don't do it by hand.
 *
 * Every decision is a node in a tree of snapshots, so any earlier moment can
 * be reopened and a different choice made from it.
 */
import { Game, type GameEvent } from '../engine/game.ts';
import { distanceMap, DIRS, idx, inBounds } from '../engine/dungeon.ts';
import { MONSTERS } from '../engine/content.ts';
import { T_WALL, type Item, type Monster, type MonsterKind, type Pos, type RuleId, type RunState, type World } from '../engine/types.ts';
import { derive, frontier, eligible, emergenceOf, previewRule, RULES, RULE_ORDER, type Preview } from '../rules/rules.ts';
import { newWorld } from '../engine/world.ts';
import { lexiconFor } from '../theme/lexicon.ts';

// ---------------------------------------------------------------------------
// Intents: what the simulator offers instead of walking.
// ---------------------------------------------------------------------------

export type Intent =
  | { kind: 'shrine' }
  | { kind: 'schism' }
  | { kind: 'merchant' }
  | { kind: 'items' }
  | { kind: 'fight'; foe: number }
  | { kind: 'clear' }
  | { kind: 'descend' }
  | { kind: 'heal' }
  | { kind: 'eat' }
  | { kind: 'gear' }
  | { kind: 'draft'; rule: RuleId | null }
  | { kind: 'reroll' }
  | { kind: 'axiom'; option: string | null }
  | { kind: 'levelup'; stat: 'str' | 'agi' | 'vit' }
  | { kind: 'buy'; id: number }
  | { kind: 'leaveShop' }
  | { kind: 'heir' };

/** The legend's categories. Every choice, tree node and chip uses one of these. */
export type ChoiceKind = 'shrine' | 'schism' | 'levelup' | 'fight' | 'items' | 'merchant' | 'stairs' | 'heart' | 'care' | 'death' | 'start';

export interface Choice {
  intent: Intent;
  kind: ChoiceKind;
  label: string;
  detail?: string;
  /** Shrine offers: what drafting it changes, and what it opens up. */
  preview?: Preview;
  unlocks?: RuleId[];
  disabled?: boolean;
}

export interface Settings {
  /** Fight back against foes that reach you while walking somewhere. */
  defend: boolean;
  /** Drink a healing item below this share of HP (0 = never). */
  healBelow: number;
  /** Stop an intent partway when HP falls below this share (0 = never). */
  pauseBelow: number;
}

export const DEFAULT_SETTINGS: Settings = { defend: true, healBelow: 0.35, pauseBelow: 0.3 };

/** What one intent did: the log lines it produced and the rules that arrived. */
export interface Outcome {
  lines: { text: string; tone: string }[];
  arrivals: { rule: RuleId; how: 'shrine' | 'mastery' | 'milestone' }[];
  axioms: string[];
  turns: number;
  hpFrom: number;
  hpTo: number;
  depthFrom: number;
  depthTo: number;
  kills: number;
  /** It stopped early because something needs a decision. */
  interrupted: boolean;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export interface Snapshot {
  world: World;
  run: RunState;
}

export function snapshotOf(g: Game): string {
  g.snapshot();
  return JSON.stringify({ world: g.world, run: g.run } satisfies Snapshot);
}

export function restore(json: string, plain: boolean): Game {
  const { world, run } = JSON.parse(json) as Snapshot;
  const g = new Game(world, run, plain);
  g.autoPickup = 'all';
  return g;
}

export function startWorld(seed: number, plain: boolean): Game {
  const world = newWorld(seed);
  const g = Game.start(world, plain);
  g.autoPickup = 'all';
  return g;
}

// ---------------------------------------------------------------------------
// Reading the floor
// ---------------------------------------------------------------------------

export interface FoeGroup {
  kind: MonsterKind;
  foes: Monster[];
}

export function foeGroups(g: Game): FoeGroup[] {
  const by = new Map<MonsterKind, Monster[]>();
  for (const m of g.run.monsters) by.set(m.kind, [...(by.get(m.kind) ?? []), m]);
  const order: MonsterKind[] = ['rat', 'bat', 'goblin', 'slime'];
  return order.filter((k) => by.has(k)).map((kind) => ({ kind, foes: by.get(kind)! }));
}

/** How many tiles the player would walk to reach `t` (−1: unreachable). */
export function pathLength(g: Game, t: Pos): number {
  const f = g.run.floor;
  const d = distanceMap(f, t);
  return d[idx(f, g.run.player.x, g.run.player.y)];
}

export function shrineState(g: Game): 'none' | 'open' | 'used' | 'dark' | 'silent' {
  const sh = g.run.floor.shrine;
  if (!sh) return 'none';
  if (sh.dark) return 'dark';
  if (sh.used) return 'used';
  return g.shrineWouldOffer() ? 'open' : 'silent';
}

/** Rules a draft would make eligible that weren't before (ignoring when they emerge). */
export function unlocksOf(g: Game, rule: RuleId): RuleId[] {
  const pool = g.world.genome?.pool;
  const now = new Set(g.world.rules);
  const next = new Set([...now, rule]);
  return RULE_ORDER.filter((id) => id !== rule && !eligible(id, now, pool) && eligible(id, next, pool));
}

/** Where every rule stands in this world, right now. */
export type RuleState = 'adopted' | 'offered' | 'available' | 'waiting' | 'locked' | 'imposed' | 'excluded';

export function ruleStates(g: Game): Record<RuleId, RuleState> {
  const w = g.world;
  const active = new Set(w.rules);
  const depth = g.run.depth;
  const front = frontier(active, { depth, emergence: w.emergence ?? {}, pool: w.genome?.pool });
  const sh = g.run.floor.shrine;
  const offered = g.run.pending?.kind === 'shrine' ? (sh?.offers ?? []) : [];
  const out = {} as Record<RuleId, RuleState>;
  for (const id of RULE_ORDER) {
    const def = RULES[id];
    if (active.has(id)) out[id] = 'adopted';
    else if (w.genome?.pool && !w.genome.pool.includes(id)) out[id] = 'excluded';
    else if (offered.includes(id)) out[id] = 'offered';
    else if (front.includes(id)) out[id] = 'available';
    else if (!def.prereqs.every((p) => active.has(p))) out[id] = 'locked';
    else if (def.imposed) out[id] = 'imposed';
    else out[id] = 'waiting';
  }
  return out;
}

// ---------------------------------------------------------------------------
// The choices on offer right now
// ---------------------------------------------------------------------------

const STAT_WORD = { str: 'STR', agi: 'AGI', vit: 'VIT' } as const;

export function choices(g: Game): Choice[] {
  const run = g.run;
  const L = g.lex;
  const p = run.player;
  const f = run.floor;
  const out: Choice[] = [];

  if (run.over) {
    out.push({ intent: { kind: 'heir' }, kind: 'death', label: run.won ? 'Begin the next Age with a new heir' : 'Carry on with a new heir', detail: 'The world keeps its rules, graves and chronicle.' });
    return out;
  }

  switch (run.pending?.kind) {
    case 'shrine': {
      const info = { glimmers: Object.keys(f.glimmer).length, monsters: run.monsters.length };
      for (const id of f.shrine?.offers ?? []) {
        const r = L.rule(id);
        out.push({
          intent: { kind: 'draft', rule: id },
          kind: 'shrine',
          label: `Draft ${r.name}`,
          detail: r.tagline,
          preview: previewRule(p, g.ctx, id, info, L),
          unlocks: unlocksOf(g, id),
        });
      }
      const cost = g.rerollCost();
      if (cost !== null) out.push({ intent: { kind: 'reroll' }, kind: 'shrine', label: `Pay ${cost} for other offers`, detail: `You have ${p.gold}.`, disabled: p.gold < cost });
      out.push({ intent: { kind: 'draft', rule: null }, kind: 'shrine', label: 'Step back', detail: 'Draft nothing for now. The shrine stays until you leave the floor.' });
      return out;
    }
    case 'schism': {
      const sc = f.schism!;
      const fam = sc.family ?? 'harm';
      for (const o of sc.offers) {
        const w = fam === 'harm' ? L.means(o as never) : fam === 'space' ? L.space(o as never) : L.time(o as never);
        out.push({ intent: { kind: 'axiom', option: o }, kind: 'schism', label: `Settle on ${w.name}`, detail: `${w.tagline} ${w.summary}` });
      }
      out.push({ intent: { kind: 'axiom', option: null }, kind: 'schism', label: 'Step away', detail: 'Leave the question open for now.' });
      return out;
    }
    case 'levelup': {
      for (const stat of ['str', 'agi', 'vit'] as const) {
        const before = derive(p, g.ctx);
        const after = derive({ ...p, [stat]: p[stat] + 1 }, g.ctx);
        const bits: string[] = [];
        if (after.attack !== before.attack) bits.push(`attack ${before.attack}→${after.attack}`);
        if (after.maxHp !== before.maxHp) bits.push(`max HP ${before.maxHp}→${after.maxHp}`);
        if (after.hit !== before.hit) bits.push(`hit ${Math.round(before.hit * 100)}%→${Math.round(after.hit * 100)}%`);
        if (after.enemyHit !== before.enemyHit) bits.push(`foes hit ${Math.round(before.enemyHit * 100)}%→${Math.round(after.enemyHit * 100)}%`);
        out.push({ intent: { kind: 'levelup', stat }, kind: 'levelup', label: `+1 ${STAT_WORD[stat]} (now ${p[stat]})`, detail: bits.join(', ') || 'No change to your numbers right now.' });
      }
      return out;
    }
    case 'shop': {
      for (const it of f.merchant?.stock ?? []) {
        const price = g.priceOf(it);
        out.push({ intent: { kind: 'buy', id: it.id }, kind: 'merchant', label: `Buy ${itemText(g, it)} for ${price}`, detail: `You have ${p.gold}.`, disabled: p.gold < price });
      }
      out.push({ intent: { kind: 'leaveShop' }, kind: 'merchant', label: 'Leave the merchant' });
      return out;
    }
  }

  // Nothing pending: the floor's own choices.
  const sh = shrineState(g);
  if (sh === 'open') out.push({ intent: { kind: 'shrine' }, kind: 'shrine', label: 'Go to the rule shrine', detail: walkNote(g, f.shrine!.pos) });
  if (g.schismOpen(f.schism)) {
    const fam = f.schism!.family ?? 'harm';
    out.push({ intent: { kind: 'schism' }, kind: 'schism', label: `Go to the schism shrine (${FAMILY_WORD[fam]})`, detail: walkNote(g, f.schism!.pos) });
  }
  const groups = foeGroups(g);
  if (run.monsters.length) {
    out.push({ intent: { kind: 'clear' }, kind: 'fight', label: `Fight every foe here (${run.monsters.length})`, detail: 'Nearest first. Stops for level-ups.' });
    for (const grp of groups) {
      const m = nearest(g, grp.foes);
      if (m) out.push({ intent: { kind: 'fight', foe: m.id }, kind: 'fight', label: `Fight the nearest ${L.foe(grp.kind).name}`, detail: `${m.hp}/${m.maxHp} HP, attack ${m.atk}, defense ${m.def}. ${walkNote(g, m)}` });
    }
  }
  const loot = run.items.filter((fi) => fi.item.kind === 'gold' || fi.item.kind === 'ammo' || p.inventory.length < 12);
  if (loot.length) out.push({ intent: { kind: 'items' }, kind: 'items', label: `Collect items (${loot.length})`, detail: lexList(loot.map((fi) => itemText(g, fi.item))) });
  if (f.merchant && g.has('commerce')) out.push({ intent: { kind: 'merchant' }, kind: 'merchant', label: 'Visit the merchant', detail: `${f.merchant.stock.length} for sale. You have ${p.gold}.` });
  const s = g.stats;
  const potion = p.inventory.find((i) => i.kind === 'potion');
  if (potion && p.hp < s.maxHp) out.push({ intent: { kind: 'heal' }, kind: 'care', label: `Use a healing item (${p.hp}/${s.maxHp} HP)`, detail: `${p.inventory.filter((i) => i.kind === 'potion').length} carried.` });
  const food = p.inventory.find((i) => i.kind === 'food');
  if (food && g.has('hunger') && p.satiety < 400) out.push({ intent: { kind: 'eat' }, kind: 'care', label: `Eat (satiety ${p.satiety})`, detail: itemText(g, food) });
  if (g.has('arms') && bestGear(g).length) out.push({ intent: { kind: 'gear' }, kind: 'care', label: 'Equip the best arms you carry', detail: bestGear(g).map((i) => itemText(g, i)).join(', ') });
  out.push({
    intent: { kind: 'descend' },
    kind: f.heart ? 'heart' : 'stairs',
    label: f.heart ? 'Go to the Heart (ends the Age)' : `Take the stairs down to depth ${run.depth + 1}`,
    detail: `${walkNote(g, f.stairs)}${sh === 'open' ? ' The unanswered rule shrine goes dark.' : ''}`,
  });
  return out;
}

export const FAMILY_WORD = { harm: 'Means of Harm', space: 'Shape of Space', time: 'Flow of Time' } as const;

function walkNote(g: Game, t: Pos): string {
  const n = pathLength(g, t);
  return n < 0 ? 'No path.' : n === 0 ? 'Here.' : `${n} tiles away.`;
}

function lexList(parts: string[]): string {
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ');
}

export function itemText(g: Game, it: Item): string {
  const L = g.lex;
  if (it.kind === 'gold') return L.t('item.currency', { n: it.amount ?? 0 });
  if (it.kind === 'ammo') return L.t('item.ammo', { n: it.amount ?? 0 });
  let s = L.itemName(it);
  if (it.kind === 'weapon') s += ` (atk ${it.atk})`;
  if (it.kind === 'armor') s += ` (def ${it.def})`;
  return s;
}

function nearest(g: Game, ms: Monster[]): Monster | undefined {
  const f = g.run.floor;
  const d = distanceMap(f, g.run.player);
  return [...ms].sort((a, b) => far(d[idx(f, a.x, a.y)]) - far(d[idx(f, b.x, b.y)]) || a.id - b.id)[0];
}
const far = (n: number) => (n < 0 ? 1e9 : n);

/** Carried arms that beat what's equipped under the current rules. */
function bestGear(g: Game): Item[] {
  const p = g.run.player;
  const out: Item[] = [];
  for (const kind of ['weapon', 'armor'] as const) {
    const now = gearScore(g, kind, p[kind]);
    const best = p.inventory.filter((i) => i.kind === kind).sort((a, b) => gearScore(g, kind, b) - gearScore(g, kind, a))[0];
    if (best && gearScore(g, kind, best) > now + 0.01) out.push(best);
  }
  return out;
}

function gearScore(g: Game, kind: 'weapon' | 'armor', it: Item | null): number {
  const d = derive({ ...g.run.player, [kind]: it }, g.ctx);
  return kind === 'weapon' ? (d.attack / d.attackCost) * (1 + d.stagger) : d.defense / d.moveCost;
}

// ---------------------------------------------------------------------------
// Carrying out an intent
// ---------------------------------------------------------------------------

/** Step budget for one intent, so nothing can loop forever. */
const MAX_STEPS = 1500;

class Runner {
  steps = 0;
  paused = false;
  private readonly startHp: number;
  constructor(
    readonly g: Game,
    readonly s: Settings,
  ) {
    this.startHp = g.run.player.hp;
  }

  get busy(): boolean {
    if (this.g.run.over || this.g.run.pending || this.steps >= MAX_STEPS || this.paused) return false;
    // Running low: hand the decision back (heal, flee, or press on), once per intent.
    const low = this.g.stats.maxHp * this.s.pauseBelow;
    if (this.g.run.player.hp < low && this.startHp >= low) {
      this.paused = true;
      this.g.log(`Paused: HP is down to ${this.g.run.player.hp}.`, 'bad');
      return false;
    }
    return true;
  }

  act(a: Parameters<Game['act']>[0]): boolean {
    this.steps++;
    return this.g.act(a);
  }

  /** Drink when low, if allowed. True if it did. */
  care(): boolean {
    const { g, s } = this;
    const p = g.run.player;
    if (!s.healBelow || p.hp >= g.stats.maxHp * s.healBelow) return false;
    const potion = p.inventory.find((i) => i.kind === 'potion');
    if (potion) return this.act({ type: 'use', id: potion.id });
    if (g.has('arcana') && p.mana >= 3) return this.act({ type: 'ability', ability: 'mend' });
    return false;
  }

  /** One blow at whatever is in reach (preferring `prefer`). False when nothing is. */
  strikeOnce(prefer?: Monster): boolean {
    const g = this.g;
    const p = g.run.player;
    const means = g.means;
    const loaded = means.cost === 'ammo' ? (p.ammo ?? 0) > 0 : means.cost === 'mana' ? p.mana >= 1 : true;
    if (means.reach !== 'adjacent' && loaded) {
      const ts = g.targets();
      const t = (prefer && ts.find((m) => m.id === prefer.id)) ?? ts[0];
      if (t) return this.act({ type: 'fire', x: t.x, y: t.y });
    }
    // Bumping harms under Strike and Discourse; under Volley and Arcanum it only shoves.
    if (means.bump === 'harm' || !loaded) {
      const adj = (prefer && cheb(prefer, p) === 1 ? prefer : undefined) ?? g.run.monsters.find((m) => cheb(m, p) === 1);
      if (adj && means.bump === 'harm') return this.act({ type: 'move', dx: adj.x - p.x, dy: adj.y - p.y });
    }
    if (means.cost === 'mana' && !loaded && g.targets().length) return this.act({ type: 'wait' });
    return false;
  }

  /** Walk one step toward `t`. `adjacent`: stop beside it rather than on it. */
  stepToward(t: Pos, adjacent = false): boolean {
    const g = this.g;
    const f = g.run.floor;
    const p = g.run.player;
    if (adjacent ? cheb(t, p) <= 1 : p.x === t.x && p.y === t.y) return false;
    for (const avoid of [true, false]) {
      const dist = bfs(g, t, avoid);
      const here = dist[idx(f, p.x, p.y)];
      if (here <= 0) continue;
      let best: Pos | null = null;
      let bestD = here;
      for (const d of DIRS) {
        const nx = p.x + d.x;
        const ny = p.y + d.y;
        if (!inBounds(f, nx, ny)) continue;
        const nd = dist[idx(f, nx, ny)];
        const blocked = g.monsterAt(nx, ny);
        if (nd >= 0 && nd < bestD && (!blocked || g.means.bump === 'harm')) {
          bestD = nd;
          best = d;
        }
      }
      if (best) return this.act({ type: 'move', dx: best.x, dy: best.y });
    }
    return false;
  }

  /** Walk to `t`, fighting back on the way if allowed. True if it got there. */
  walkTo(t: Pos, adjacent = false): boolean {
    const g = this.g;
    while (this.busy) {
      const p = g.run.player;
      if (adjacent ? cheb(t, p) <= 1 : p.x === t.x && p.y === t.y) return true;
      if (this.care()) continue;
      if (this.s.defend && g.run.monsters.some((m) => m.aware && cheb(m, p) <= 1) && this.strikeOnce()) continue;
      if (!this.stepToward(t, adjacent)) return false;
    }
    return false;
  }

  fight(foeId: number) {
    const g = this.g;
    let idle = 0;
    while (this.busy) {
      const m = g.run.monsters.find((o) => o.id === foeId);
      if (!m) return;
      if (this.care()) continue;
      if (this.strikeOnce(m)) {
        idle = 0;
        continue;
      }
      // Volley with an empty quiver: go and pick up shots first.
      if (g.means.cost === 'ammo' && !(g.run.player.ammo ?? 0)) {
        const ammo = g.run.items.find((fi) => fi.item.kind === 'ammo');
        if (ammo && this.walkTo(ammo)) continue;
        g.log('No shots left to fire, and none lying about.', 'dim');
        return;
      }
      if (!this.stepToward(m, true)) {
        if (++idle > 3) return;
        this.act({ type: 'wait' });
      }
    }
  }

  clear() {
    const g = this.g;
    while (this.busy && g.run.monsters.length) {
      const m = nearest(g, g.run.monsters);
      if (!m) return;
      const before = g.run.monsters.length;
      const steps = this.steps;
      this.fight(m.id);
      // No progress against this one: give up rather than spin.
      if (g.run.monsters.length === before && g.run.monsters.some((o) => o.id === m.id) && this.steps - steps < 2) return;
    }
  }

  items() {
    const g = this.g;
    const tried = new Set<string>();
    while (this.busy) {
      const p = g.run.player;
      const left = g.run.items.filter((fi) => !tried.has(`${fi.x},${fi.y}`) && (fi.item.kind === 'gold' || fi.item.kind === 'ammo' || p.inventory.length < 12));
      if (!left.length) return;
      const f = g.run.floor;
      const d = distanceMap(f, p);
      const fi = [...left].sort((a, b) => far(d[idx(f, a.x, a.y)]) - far(d[idx(f, b.x, b.y)]))[0];
      tried.add(`${fi.x},${fi.y}`);
      this.walkTo(fi);
    }
  }
}

const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Distances to `t` over open tiles; the simulator knows the whole floor, dark or not. */
function bfs(g: Game, t: Pos, avoidHazards: boolean): Int16Array {
  const f = g.run.floor;
  const dist = new Int16Array(f.w * f.h).fill(-1);
  const start = idx(f, t.x, t.y);
  dist[start] = 0;
  const q = [start];
  const p = g.run.player;
  const hazards = avoidHazards && g.has('elements');
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    const x = i % f.w;
    const y = (i - x) / f.w;
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (!inBounds(f, nx, ny)) continue;
      const ni = idx(f, nx, ny);
      if (dist[ni] !== -1 || f.tiles[ni] === T_WALL) continue;
      if (hazards && f.glimmer[ni] && !(nx === p.x && ny === p.y)) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}

/** Carry out one intent on `g` (mutating it) and report what happened. */
export function perform(g: Game, intent: Intent, s: Settings = DEFAULT_SETTINGS): { game: Game; outcome: Outcome } {
  if (intent.kind === 'heir') {
    const next = Game.start(g.world, g.lex.plain);
    next.autoPickup = 'all';
    const outcome = blankOutcome(g);
    outcome.lines = next.run.log.map((l) => ({ text: l.text, tone: l.tone }));
    outcome.depthTo = 1;
    outcome.hpTo = next.run.player.hp;
    return { game: next, outcome };
  }
  const outcome = blankOutcome(g);
  const turn0 = g.run.turn;
  const kills0 = g.run.player.kills;
  const origLog = g.log.bind(g);
  g.log = (text, tone = 'info', show = false) => {
    outcome.lines.push({ text, tone });
    origLog(text, tone, show);
  };
  g.events = [];
  const r = new Runner(g, s);
  const f = () => g.run.floor;
  try {
    switch (intent.kind) {
      case 'shrine':
        if (f().shrine) r.walkTo(f().shrine!.pos);
        break;
      case 'schism':
        if (f().schism) r.walkTo(f().schism!.pos);
        break;
      case 'merchant':
        if (f().merchant) r.walkTo(f().merchant!.pos);
        break;
      case 'items':
        r.items();
        break;
      case 'fight':
        r.fight(intent.foe);
        break;
      case 'clear':
        r.clear();
        break;
      case 'descend':
        if (r.walkTo(f().stairs) && r.busy) r.act({ type: 'descend' });
        break;
      case 'heal': {
        const it = g.run.player.inventory.find((i) => i.kind === 'potion');
        if (it) r.act({ type: 'use', id: it.id });
        break;
      }
      case 'eat': {
        const it = g.run.player.inventory.find((i) => i.kind === 'food');
        if (it) r.act({ type: 'use', id: it.id });
        break;
      }
      case 'gear':
        for (const it of bestGear(g)) r.act({ type: 'equip', id: it.id });
        break;
      case 'draft':
        r.act({ type: 'shrine', rule: intent.rule });
        break;
      case 'reroll':
        r.act({ type: 'reroll' });
        break;
      case 'axiom':
        r.act({ type: 'schism', harm: intent.option });
        break;
      case 'levelup':
        r.act({ type: 'levelup', stat: intent.stat });
        break;
      case 'buy':
        r.act({ type: 'buy', id: intent.id });
        break;
      case 'leaveShop':
        r.act({ type: 'leaveShop' });
        break;
    }
  } finally {
    // Back to the class method: snapshots must not carry the wrapper.
    delete (g as unknown as { log?: unknown }).log;
  }
  if (r.steps >= MAX_STEPS) outcome.lines.push({ text: 'Stopped: that went on too long.', tone: 'dim' });
  for (const e of g.events as GameEvent[]) {
    if (e.type === 'rule') outcome.arrivals.push({ rule: e.rule, how: e.how });
    if (e.type === 'axiom') outcome.axioms.push(e.harm);
  }
  outcome.turns = g.run.turn - turn0;
  outcome.kills = g.run.player.kills - kills0;
  outcome.hpTo = g.run.over ? 0 : g.run.player.hp;
  outcome.depthTo = g.run.depth;
  // Stopped short: paused on low HP, or something other than what it went for wants an answer.
  const aim = { shrine: 'shrine', schism: 'schism', merchant: 'shop', buy: 'shop', reroll: 'shrine' } as Record<string, string>;
  const pend = g.run.pending?.kind;
  outcome.interrupted = r.paused || (!!pend && aim[intent.kind] !== pend && !['draft', 'axiom', 'levelup'].includes(intent.kind));
  return { game: g, outcome };
}

function blankOutcome(g: Game): Outcome {
  return { lines: [], arrivals: [], axioms: [], turns: 0, hpFrom: g.run.player.hp, hpTo: g.run.player.hp, depthFrom: g.run.depth, depthTo: g.run.depth, kills: 0, interrupted: false };
}

/** A short line for the branch tree. */
export function intentLabel(g: Game, intent: Intent): string {
  const L = g.lex;
  switch (intent.kind) {
    case 'draft':
      return intent.rule ? `Drafted ${L.rule(intent.rule).name}` : 'Stepped back from the shrine';
    case 'axiom': {
      if (!intent.option) return 'Left the schism open';
      const fam = g.run.floor.schism?.family ?? 'harm';
      const w = fam === 'harm' ? L.means(intent.option as never) : fam === 'space' ? L.space(intent.option as never) : L.time(intent.option as never);
      return `Settled ${w.name}`;
    }
    case 'levelup':
      return `+1 ${STAT_WORD[intent.stat]}`;
    case 'fight': {
      const m = g.run.monsters.find((o) => o.id === intent.foe);
      return `Fought ${m ? `a ${L.foe(m.kind).name}` : 'a foe'}`;
    }
    case 'clear':
      return 'Fought every foe';
    case 'items':
      return 'Collected items';
    case 'shrine':
      return 'Went to the rule shrine';
    case 'schism':
      return 'Went to the schism shrine';
    case 'merchant':
      return 'Visited the merchant';
    case 'buy': {
      const it = g.run.floor.merchant?.stock.find((i) => i.id === intent.id);
      return `Bought ${it ? itemText(g, it) : 'something'}`;
    }
    case 'leaveShop':
      return 'Left the merchant';
    case 'reroll':
      return 'Paid for other offers';
    case 'descend':
      return g.run.floor.heart ? 'Went to the Heart' : `Descended to ${g.run.depth + 1}`;
    case 'heal':
      return 'Used a healing item';
    case 'eat':
      return 'Ate';
    case 'gear':
      return 'Equipped better arms';
    case 'heir':
      return 'New heir';
  }
}

export function kindOfIntent(g: Game, intent: Intent): ChoiceKind {
  switch (intent.kind) {
    case 'draft':
    case 'reroll':
    case 'shrine':
      return 'shrine';
    case 'axiom':
    case 'schism':
      return 'schism';
    case 'levelup':
      return 'levelup';
    case 'fight':
    case 'clear':
      return 'fight';
    case 'items':
      return 'items';
    case 'merchant':
    case 'buy':
    case 'leaveShop':
      return 'merchant';
    case 'descend':
      return g.run.floor.heart ? 'heart' : 'stairs';
    case 'heal':
    case 'eat':
    case 'gear':
      return 'care';
    case 'heir':
      return 'start';
  }
}

export const intentKey = (i: Intent) => JSON.stringify(i);

// ---------------------------------------------------------------------------
// The tree of branches
// ---------------------------------------------------------------------------

export interface BranchNode {
  id: number;
  parent: number | null;
  children: number[];
  intent: Intent | null;
  label: string;
  kind: ChoiceKind;
  /** State after this node's intent. */
  snap: string;
  depth: number;
  hp: number;
  maxHp: number;
  turn: number;
  over: boolean;
  won: boolean;
  outcome: Outcome | null;
}

export class Tree {
  nodes = new Map<number, BranchNode>();
  current: number;
  private next = 0;

  constructor(g: Game) {
    this.current = this.add(null, null, 'Start', 'start', g, null);
  }

  private add(parent: number | null, intent: Intent | null, label: string, kind: ChoiceKind, g: Game, outcome: Outcome | null): number {
    const id = this.next++;
    this.nodes.set(id, {
      id,
      parent,
      children: [],
      intent,
      label,
      kind: g.run.over && !g.run.won ? 'death' : kind,
      snap: snapshotOf(g),
      depth: g.run.depth,
      hp: g.run.over ? 0 : g.run.player.hp,
      maxHp: g.stats.maxHp,
      turn: g.run.turn,
      over: g.run.over,
      won: !!g.run.won,
      outcome,
    });
    if (parent !== null) this.nodes.get(parent)!.children.push(id);
    return id;
  }

  node(id = this.current): BranchNode {
    return this.nodes.get(id)!;
  }

  /** Take `intent` from the current node. The engine is deterministic, so a repeat choice reopens the branch it made before. */
  choose(intent: Intent, plain: boolean, s: Settings): { game: Game; node: BranchNode; reused: boolean } {
    const here = this.node();
    const key = intentKey(intent);
    const same = here.children.map((c) => this.node(c)).find((c) => c.intent && intentKey(c.intent) === key);
    if (same) {
      this.current = same.id;
      return { game: restore(same.snap, plain), node: same, reused: true };
    }
    const g = restore(here.snap, plain);
    const label = intentLabel(g, intent);
    const kind = kindOfIntent(g, intent);
    const { game, outcome } = perform(g, intent, s);
    this.current = this.add(here.id, intent, label, kind, game, outcome);
    return { game, node: this.node(), reused: false };
  }

  goto(id: number, plain: boolean): Game {
    this.current = id;
    return restore(this.node(id).snap, plain);
  }

  /** The path from the root to `id`. */
  path(id = this.current): BranchNode[] {
    const out: BranchNode[] = [];
    for (let n: BranchNode | undefined = this.node(id); n; n = n.parent === null ? undefined : this.node(n.parent)) out.unshift(n);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Facts for the legend and the world panel
// ---------------------------------------------------------------------------

export function foeFacts(kind: MonsterKind) {
  return MONSTERS[kind];
}

export function emergenceTable(g: Game): { rule: RuleId; depth: number }[] {
  return RULE_ORDER.map((rule) => ({ rule, depth: emergenceOf(g.world, rule) }));
}

/** The world's words for comparison when the simulator speaks plainly. */
export function themedLexicon(g: Game) {
  return lexiconFor(g.world, false);
}
