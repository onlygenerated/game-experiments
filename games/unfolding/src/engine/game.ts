import {
  alt,
  BASE_STAT,
  ctxOf,
  derive,
  frontier,
  eligible,
  emergenceOf,
  MASTERY_KILLS,
  MAX_SATIETY,
  RULE_ORDER,
  RULES,
  weightOf,
  type Derived,
  type RuleCtx,
} from '../rules/rules.ts';
import { BALANCE as B } from './balance.ts';
import {
  itemLabel,
  itemsForRule,
  lootFor,
  makeItem,
  monsterCount,
  MONSTERS,
  populate,
  scatter,
  spawnMonsters,
  type GenCtx,
} from './content.ts';
import { DIRS, distanceMap, generateLayout, idx, passable, randomFloorTile, soloRoom, type LayoutOpts } from './dungeon.ts';
import { ray } from './aim.ts';
import { HARMS, MEANS, type HarmId, type MeansModule } from '../rules/harm.ts';
import { article, lexiconFor, PREMISES, type Lexicon } from '../theme/lexicon.ts';
import type { RuleHost } from '../rules/modules.ts';
import { computeVisible, lineOfSight } from './fov.ts';
import { hashSeed, Rng } from './rng.ts';
import { T_FLOOR, T_UP, type FloorItem, type Grave, type Item, type Monster, type Player, type Pos, type RuleId, type RunState, type Tone, type World } from './types.ts';
import { heirName } from './world.ts';

export type Action =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'wait' }
  | { type: 'descend' }
  | { type: 'ascend' }
  | { type: 'use'; id: number }
  | { type: 'equip'; id: number }
  | { type: 'unequip'; slot: 'weapon' | 'armor' }
  | { type: 'drop'; id: number }
  /** Pick up one item here (by id), or everything here. */
  | { type: 'pickup'; id?: number }
  | { type: 'ability'; ability: 'cleave' | 'mend' }
  | { type: 'shrine'; rule: RuleId | null }
  | { type: 'levelup'; stat: 'str' | 'agi' | 'vit' }
  /** Aimed harm: at a tile, or (without one) at the nearest foe in reach. */
  | { type: 'fire'; x?: number; y?: number }
  /** Commerce, while trading with a merchant. */
  | { type: 'buy'; id: number }
  | { type: 'sell'; id: number }
  | { type: 'leaveShop' }
  /** Commerce: pay the shrine you're answering to show other offers. */
  | { type: 'reroll' }
  /** Answer a schism shrine: settle how harm works, or step away (null). */
  | { type: 'schism'; harm: HarmId | null };

export type GameEvent =
  | { type: 'rule'; rule: RuleId; how: 'shrine' | 'mastery' | 'milestone' }
  /** The world's Means of Harm became known: rolled at its creation, or chosen at a schism shrine. */
  | { type: 'axiom'; harm: HarmId; how: 'rolled' | 'schism' }
  /** A line worth putting in front of the player for a moment, not just in the log. */
  | { type: 'say'; text: string; tone: Tone }
  /** Something to read before going on: the start of a run. */
  | { type: 'story'; title: string; eyebrow: string; lines: string[]; hint?: string }
  /** Aimed harm flew over these tiles (for the renderer to draw). */
  | { type: 'shot'; path: Pos[] }
  | { type: 'death' }
  /** The player moved to another floor (either direction). */
  | { type: 'floor'; depth: number };

export const INVENTORY_CAP = 12;

/** What stepping onto items does: take everything, take only gold, or just tell you. */
export type AutoPickup = 'all' | 'gold' | 'none';
export const CLEAVE_COST = B.arcana.cleaveCost;
export const MEND_COST = B.arcana.mendCost;

export function newPlayer(name: string): Player {
  return {
    name,
    x: 0,
    y: 0,
    hp: 20,
    str: BASE_STAT,
    agi: BASE_STAT,
    vit: BASE_STAT,
    level: 1,
    xp: 0,
    inventory: [],
    weapon: null,
    armor: null,
    gold: 0,
    satiety: MAX_SATIETY,
    mana: 0,
    kills: 0,
    regenClock: 0,
    manaClock: 0,
    starveClock: 0,
  };
}

export function xpNeeded(level: number, ctx: RuleCtx): number {
  return Math.round(B.growth.xpBase * level ** B.growth.xpExp * (alt(ctx, 'growth') ? B.growth.quickMult : 1));
}

export { article };

const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export class Game implements RuleHost {
  world: World;
  run: RunState;
  rng: Rng;
  events: GameEvent[] = [];
  visible = new Set<number>();
  /** A player preference, not part of the run: set by the UI from its options. */
  autoPickup: AutoPickup = 'all';
  /** The words this world speaks: every message the engine logs comes from here. The UI swaps in Plain labels. */
  lex: Lexicon;
  /**
   * Running totals for the balance probe (damage, healing by source, food in
   * and out, what spawned…). Not saved; nothing in play reads them.
   */
  tally: Record<string, number> = {};

  private count(key: string, n = 1) {
    this.tally[key] = (this.tally[key] ?? 0) + n;
  }

  private countSpawned(items: Item[]) {
    for (const it of items) {
      this.count(`spawn_${it.kind}`);
      if (it.kind === 'food') this.count('satietySpawned', it.nourish ?? 0);
      if (it.kind === 'gold') this.count('goldSpawned', it.amount ?? 0);
    }
  }

  /** `plain`: speak The Plain words (the Plain labels option) instead of the world's own. */
  constructor(world: World, run: RunState, plain = false) {
    this.world = world;
    this.run = run;
    this.lex = lexiconFor(world, plain);
    this.rng = new Rng(run.rng);
    this.refreshVision();
  }

  /** Start a new character in `world`. The world's rulebook carries over untouched. */
  static start(world: World, plain = false): Game {
    world.generation += 1;
    const gen = world.generation;
    const run: RunState = {
      worldId: world.id,
      gen,
      turn: 0,
      depth: 1,
      floor: generateLayout(world.seed, 1, layoutOpts(world)),
      monsters: [],
      items: [],
      player: newPlayer(heirName(world, gen)),
      rng: hashSeed(world.seed, 'run', gen),
      nextId: 1,
      log: [],
      pending: null,
      pendingLevelUps: 0,
      over: false,
      cause: null,
    };
    const game = new Game(world, run, plain);
    game.enterFloor(1);
    const p = run.player;
    const d = game.stats;
    p.hp = d.maxHp;
    p.mana = d.maxMana;
    if (game.ctx.harm === 'volley') p.ammo = B.harm.startAmmo;
    const L = game.lex;
    const story: string[] = [];
    if (world.rules.length === 0) {
      story.push(L.premise.pitch, L.t('start.fresh'));
      game.log(L.t('start.fresh'), 'info');
      game.log(L.t('start.hint'), 'dim');
    } else {
      const line = L.t('start.heir', { name: p.name, world: world.name, n: world.rules.length });
      story.push(line);
      game.log(line, 'info');
    }
    // Borrowed things are announced to every heir: the world explains its own oddities.
    for (const { bundle, from } of world.genome?.intrusions ?? []) {
      const line = `${L.premise.seep} ${L.t(`intrusion.${bundle}`, { donor: PREMISES[from].name })}`;
      story.push(line);
      game.log(line, 'dim');
    }
    game.events.push({
      type: 'story',
      title: world.rules.length === 0 ? world.name : p.name,
      eyebrow: world.rules.length === 0 ? PREMISES[world.genome?.premise ?? 'old-stone'].name : `${world.name} · ${L.t('hud.heir', { n: gen })}`,
      lines: story,
      hint: world.rules.length === 0 ? L.t('start.hint') : undefined,
    });
    return game;
  }

  get ctx(): RuleCtx {
    return ctxOf(this.world);
  }

  get stats(): Derived {
    return derive(this.run.player, this.ctx);
  }

  has(id: RuleId): boolean {
    return this.world.rules.includes(id);
  }

  /** How harm works in this world right now (Strike while a schism is still open). */
  get means(): MeansModule {
    return MEANS[this.ctx.harm];
  }

  /** Has this world settled its Means of Harm? Open worlds wait for a schism shrine. */
  get harmSettled(): boolean {
    return !!this.world.genome?.axioms.harm;
  }

  /** Persistable state, with the RNG position folded in. */
  snapshot(): RunState {
    this.run.rng = this.rng.state;
    return this.run;
  }

  /** Log a line; `show` also flashes it on screen (kills, level-ups, finds). */
  log(text: string, tone: Tone = 'info', show = false) {
    if (show) this.events.push({ type: 'say', text, tone });
    this.run.log.push({ text, tone, turn: this.run.turn });
    if (this.run.log.length > 80) this.run.log.splice(0, this.run.log.length - 80);
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.run.monsters.find((m) => m.x === x && m.y === y);
  }

  graveAt(x: number, y: number): Grave | undefined {
    return this.floorGraves().find((g) => g.x === x && g.y === y);
  }

  /** Graves of earlier heirs on this floor. */
  /** Graves of earlier heirs on this floor — only those in parts of it that exist under the current rules. */
  floorGraves(): Grave[] {
    const f = this.run.floor;
    return this.world.graves.filter(
      (g) => g.depth === this.run.depth && g.gen < this.run.gen && passable(f, g.x, g.y),
    );
  }

  isVisible(x: number, y: number): boolean {
    return this.visible.has(idx(this.run.floor, x, y));
  }

  refreshVision() {
    const { floor, player } = this.run;
    this.visible = computeVisible(floor, player, this.stats.sight);
    for (const i of this.visible) floor.explored[i] = 1;
  }

  genCtx(tag: string | number): GenCtx {
    const rng = new Rng(hashSeed(this.world.seed, this.run.gen, this.run.depth, tag));
    return { rng, ctx: this.ctx, lex: this.lex, nextId: () => this.run.nextId++ };
  }

  /**
   * Arrive on a floor: `down` puts you on its stairs up (where you start),
   * `up` on its stairs down. A floor you've been to comes back as you left
   * it, then catches up on any rules the world adopted since.
   */
  private enterFloor(depth: number, via: 'down' | 'up' = 'down') {
    const run = this.run;
    run.depth = depth;
    const stored = run.visited?.[depth];
    const arrive = () => {
      const at = via === 'down' ? run.floor.start : run.floor.stairs;
      run.player.x = at.x;
      run.player.y = at.y;
    };
    if (stored) {
      delete run.visited![depth];
      run.floor = stored.floor;
      run.monsters = stored.monsters;
      run.items = stored.items;
      arrive();
      const missed = RULE_ORDER.filter((r) => this.has(r) && !stored.rules.includes(r));
      for (const r of missed) this.reinterpretFloor(r);
      if (missed.length) this.log(this.lex.t('floor.changed'), 'dim');
    } else {
      run.floor = generateLayout(this.world.seed, depth, layoutOpts(this.world));
      const { monsters, items } = populate(run.floor, this.genCtx('populate'));
      run.monsters = monsters;
      run.items = items;
      this.countSpawned(items.map((fi) => fi.item));
      this.count('floorsEntered');
      if (this.has('peril') && !this.harmSettled) this.placeSchism();
      if (this.has('commerce')) this.placeMerchant();
    }
    arrive();
    this.clearArrival();
    this.world.deepest = Math.max(this.world.deepest, depth);
    this.refreshVision();
    if (stored) return;
    const graves = this.floorGraves().filter((g) => !g.looted);
    if (graves.length) this.log(graves.length === 1 ? this.lex.t('graves.one') : this.lex.t('graves.many', { n: graves.length }), 'dim', true);
  }

  /** Nothing may be standing where the player arrives: shoo it to the nearest open tile. */
  private clearArrival() {
    const { player: p, floor: f } = this.run;
    const m = this.monsterAt(p.x, p.y);
    if (!m) return;
    const dist = distanceMap(f, p);
    let best = -1;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] <= 0) continue;
      const x = i % f.w;
      const y = (i - x) / f.w;
      if (this.monsterAt(x, y)) continue;
      if (best < 0 || dist[i] < dist[best]) best = i;
    }
    if (best >= 0) {
      m.x = best % f.w;
      m.y = (best - m.x) / f.w;
    }
  }

  /** Would this floor's shrine offer anything if you stepped on it now? */
  shrineWouldOffer(): boolean {
    const sh = this.run.floor.shrine;
    if (!sh || sh.used) return false;
    if (sh.offers?.length) return true;
    return frontier(new Set(this.world.rules), { depth: this.run.depth, emergence: this.world.emergence ?? {}, pool: this.world.genome?.pool }).length > 0;
  }

  /** Taking any stairs: an unanswered shrine goes dark, and the floor is kept for your return. */
  private leaveFloor() {
    const run = this.run;
    const sh = run.floor.shrine;
    if (sh && !sh.used) {
      if (this.shrineWouldOffer()) this.log(this.lex.t('shrine.dark'), 'dim');
      sh.used = true;
      sh.dark = true;
    }
    run.visited = run.visited ?? {};
    run.visited[run.depth] = { floor: run.floor, monsters: run.monsters, items: run.items, rules: [...this.world.rules] };
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Apply one player action. Returns true if it did anything. */
  act(a: Action): boolean {
    const run = this.run;
    if (run.over) return false;
    if (run.pending) {
      if (run.pending.kind === 'shrine' && a.type === 'shrine') return this.resolveShrine(a.rule);
      if (run.pending.kind === 'shrine' && a.type === 'reroll') return this.reroll();
      if (run.pending.kind === 'shop') {
        if (a.type === 'buy') return this.buy(a.id);
        if (a.type === 'sell') return this.sell(a.id);
        if (a.type === 'leaveShop') {
          run.pending = null;
          this.log(this.lex.t('shop.leave'), 'dim');
          this.settlePending();
          return true;
        }
      }
      if (run.pending.kind === 'levelup' && a.type === 'levelup') return this.resolveLevelUp(a.stat);
      if (run.pending.kind === 'schism' && a.type === 'schism') return this.resolveSchism(a.harm);
      return false;
    }
    let cost = 0;
    switch (a.type) {
      case 'move':
        cost = this.move(a.dx, a.dy);
        break;
      case 'wait':
        cost = 1;
        break;
      case 'descend':
        return this.descend();
      case 'ascend':
        return this.ascend();
      case 'use':
        cost = this.use(a.id);
        break;
      case 'equip':
        cost = this.equip(a.id);
        break;
      case 'unequip':
        cost = this.unequip(a.slot);
        break;
      case 'drop':
        cost = this.drop(a.id);
        break;
      case 'pickup':
        cost = this.pickup(a.id);
        break;
      case 'ability':
        cost = this.ability(a.ability);
        break;
      case 'fire':
        cost = this.fire(a.x === undefined || a.y === undefined ? undefined : { x: a.x, y: a.y });
        break;
      default:
        return false;
    }
    if (cost > 0) this.passTime(cost);
    this.settlePending();
    return cost > 0 || run.pending !== null;
  }

  private settlePending() {
    if (!this.run.pending && this.run.pendingLevelUps > 0 && !this.run.over) this.run.pending = { kind: 'levelup' };
  }

  private move(dx: number, dy: number): number {
    const { player: p, floor } = this.run;
    const nx = p.x + dx;
    const ny = p.y + dy;
    const m = this.monsterAt(nx, ny);
    if (m) {
      if (this.means.bump === 'harm') this.harm(m);
      else this.shove(m, dx, dy);
      return this.stats.attackCost;
    }
    if (!passable(floor, nx, ny)) return 0;
    const cost = this.stats.moveCost;
    p.x = nx;
    p.y = ny;
    return cost + this.enterTile();
  }

  /** Effects of stepping onto the player's current tile. Returns extra turns lost. */
  private enterTile(): number {
    const { player: p, floor } = this.run;
    let extra = 0;
    const left: string[] = [];
    for (const fi of this.itemsHere()) {
      const counted = fi.item.kind === 'gold' || fi.item.kind === 'ammo';
      const auto = this.autoPickup === 'all' || (this.autoPickup === 'gold' && counted);
      if (auto && this.take(fi, true)) continue;
      const label = itemLabel(fi.item, this.ctx, this.lex);
      left.push(counted ? label : `${article(label)} ${label}`);
    }
    if (left.length) this.log(this.lex.t('pickup.see', { what: this.lex.list(left) }), 'info');
    const g = floor.glimmer[idx(floor, p.x, p.y)];
    if (g) {
      if (this.has('elements')) {
        if (g === 'frost') {
          this.log(this.lex.t('frost.you'), 'bad');
          extra += 1;
        }
      } else {
        this.log(this.lex.t(g === 'ember' ? 'glimmer.ember' : 'glimmer.frost'), 'dim');
      }
    }
    if (p.x === floor.stairs.x && p.y === floor.stairs.y) this.log(this.lex.t('stairs.down.here'), 'info');
    if (floor.tiles[idx(floor, p.x, p.y)] === T_UP) this.log(this.lex.t('stairs.up.here', { n: this.run.depth - 1 }), 'info');
    const sh = floor.shrine;
    if (sh && !sh.used && sh.pos.x === p.x && sh.pos.y === p.y) this.openShrine();
    const mc = floor.merchant;
    if (mc && mc.pos.x === p.x && mc.pos.y === p.y && this.has('commerce')) {
      this.log(this.lex.t(mc.stock.length ? 'shop.open' : 'shop.empty'), 'info');
      this.run.pending = { kind: 'shop' };
    }
    const sc = floor.schism;
    if (sc && !sc.used && !this.harmSettled && sc.pos.x === p.x && sc.pos.y === p.y) {
      this.log(this.lex.t('schism.open'), 'rule');
      this.run.pending = { kind: 'schism' };
    }
    const grave = this.graveAt(p.x, p.y);
    if (grave) this.visitGrave(grave);
    return extra;
  }

  private descend(): boolean {
    const { player: p, floor } = this.run;
    if (p.x !== floor.stairs.x || p.y !== floor.stairs.y) {
      this.log(this.lex.t('stairs.down.none'), 'dim');
      return false;
    }
    this.leaveFloor();
    const depth = this.run.depth + 1;
    // Imposed rules arrive by themselves once they've emerged and can stand.
    for (const id of RULE_ORDER) {
      if (!RULES[id].imposed || emergenceOf(this.world, id) > depth) continue;
      if (eligible(id, new Set(this.world.rules), this.world.genome?.pool)) this.adopt(id, 'milestone');
    }
    this.enterFloor(depth, 'down');
    this.events.push({ type: 'floor', depth });
    this.log(this.lex.t('stairs.descend', { n: depth }), 'info');
    return true;
  }

  private ascend(): boolean {
    const { player: p, floor } = this.run;
    if (this.run.depth <= 1 || floor.tiles[idx(floor, p.x, p.y)] !== T_UP) {
      this.log(this.lex.t('stairs.up.none'), 'dim');
      return false;
    }
    this.leaveFloor();
    const depth = this.run.depth - 1;
    this.enterFloor(depth, 'up');
    this.events.push({ type: 'floor', depth });
    this.log(this.lex.t('stairs.ascend', { n: depth }), 'info');
    return true;
  }

  private use(id: number): number {
    const p = this.run.player;
    const item = p.inventory.find((i) => i.id === id);
    if (!item) return 0;
    if (item.kind === 'potion') {
      const heal = Math.round((item.heal ?? 0) * (alt(this.ctx, 'things') ? B.potion.generousMult : 1));
      const before = p.hp;
      p.hp = Math.min(this.stats.maxHp, p.hp + heal);
      this.count('healPotion', p.hp - before);
      this.count('potionsDrunk');
      this.log(this.lex.t('drink', { n: p.hp - before }), 'good');
    } else if (item.kind === 'food') {
      if (!this.has('hunger')) {
        this.log(this.lex.t('eat.never'), 'dim');
        return 0;
      }
      const before = p.satiety;
      p.satiety = Math.min(MAX_SATIETY, p.satiety + (item.nourish ?? 0));
      this.count('satietyEaten', p.satiety - before);
      this.count('satietyWasted', (item.nourish ?? 0) - (p.satiety - before));
      this.count('foodEaten');
      this.log(this.lex.t('eat', { item: this.lex.itemName(item) }), 'good');
    } else {
      return this.equip(id);
    }
    p.inventory = p.inventory.filter((i) => i !== item);
    return 1;
  }

  private equip(id: number): number {
    const p = this.run.player;
    const item = p.inventory.find((i) => i.id === id);
    if (!item || (item.kind !== 'weapon' && item.kind !== 'armor') || !this.has('arms')) return 0;
    const slot = item.kind;
    const old = p[slot];
    p[slot] = item;
    p.inventory = p.inventory.filter((i) => i !== item);
    if (old) p.inventory.push(old);
    const label = itemLabel(item, this.ctx, this.lex);
    this.log(this.lex.t(slot === 'weapon' ? 'equip.weapon' : 'equip.armor', { item: label }), 'good');
    if (this.has('weight') && weightOf(item, this.ctx) > p.str) {
      this.log(this.lex.t(slot === 'weapon' ? 'heavy.weapon' : 'heavy.armor', { item: label }), 'bad');
    }
    return 1;
  }

  private unequip(slot: 'weapon' | 'armor'): number {
    const p = this.run.player;
    const item = p[slot];
    if (!item) return 0;
    if (p.inventory.length >= INVENTORY_CAP) {
      this.log(this.lex.t('pack.full'), 'dim');
      return 0;
    }
    p[slot] = null;
    p.inventory.push(item);
    this.log(this.lex.t('unequip', { item: itemLabel(item, this.ctx, this.lex) }), 'info');
    return 1;
  }

  /** Items lying on the player's tile. */
  itemsHere(): FloorItem[] {
    const p = this.run.player;
    return this.run.items.filter((fi) => fi.x === p.x && fi.y === p.y);
  }

  /** Move one floor item into the pack (gold into the purse). False if the pack is full. */
  private take(fi: FloorItem, quietWhenFull: boolean): boolean {
    const p = this.run.player;
    if (fi.item.kind === 'gold') {
      p.gold += fi.item.amount ?? 0;
      this.log(this.lex.t('pickup.currency', { n: fi.item.amount ?? 0 }), 'good');
    } else if (fi.item.kind === 'ammo') {
      p.ammo = (p.ammo ?? 0) + (fi.item.amount ?? 0);
      this.log(this.lex.t('pickup.ammo', { n: fi.item.amount ?? 0 }), 'good');
    } else if (p.inventory.length >= INVENTORY_CAP) {
      if (!quietWhenFull) this.log(this.lex.t('pickup.full', { item: itemLabel(fi.item, this.ctx, this.lex) }), 'dim');
      return false;
    } else {
      p.inventory.push(fi.item);
      this.log(this.lex.t('pickup.item', { item: itemLabel(fi.item, this.ctx, this.lex) }), 'good');
    }
    this.run.items = this.run.items.filter((o) => o !== fi);
    return true;
  }

  /** Deliberate pickup costs a turn; walking past is free. */
  private pickup(id?: number): number {
    const here = this.itemsHere().filter((fi) => id === undefined || fi.item.id === id);
    if (!here.length) {
      this.log(this.lex.t('pickup.nothing'), 'dim');
      return 0;
    }
    let took = 0;
    for (const fi of here) if (this.take(fi, false)) took++;
    return took ? 1 : 0;
  }

  private drop(id: number): number {
    const p = this.run.player;
    const item = p.inventory.find((i) => i.id === id);
    if (!item) return 0;
    p.inventory = p.inventory.filter((i) => i !== item);
    this.run.items.push({ item, x: p.x, y: p.y });
    this.log(this.lex.t('drop', { item: itemLabel(item, this.ctx, this.lex) }), 'info');
    return 1;
  }

  private ability(which: 'cleave' | 'mend'): number {
    const p = this.run.player;
    if (!this.has('arcana')) return 0;
    const costMana = which === 'cleave' ? CLEAVE_COST : MEND_COST;
    if (p.mana < costMana) {
      this.log(this.lex.t('ability.nomana', { ability: this.lex.t(which === 'cleave' ? 'ability.cleave' : 'ability.mend'), n: costMana }), 'dim');
      return 0;
    }
    if (which === 'cleave') {
      const targets = this.run.monsters.filter((m) => cheb(m, p) === 1);
      if (!targets.length) {
        this.log(this.lex.t('cleave.none'), 'dim');
        return 0;
      }
      p.mana -= costMana;
      this.log(this.lex.t('cleave'), 'good');
      for (const m of targets) if (this.run.monsters.includes(m)) this.harm(m);
      return this.stats.attackCost;
    }
    p.mana -= costMana;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + Math.ceil(this.stats.maxHp * B.arcana.mendFraction));
    this.count('healMend', p.hp - before);
    this.log(this.lex.t('mend', { n: p.hp - before }), 'good');
    return 1;
  }

  // -------------------------------------------------------------------------
  // Shrines, rules, level-ups
  // -------------------------------------------------------------------------

  private openShrine() {
    const sh = this.run.floor.shrine!;
    const front = frontier(new Set(this.world.rules), { depth: this.run.depth, emergence: this.world.emergence ?? {}, pool: this.world.genome?.pool });
    if (sh.offers) sh.offers = sh.offers.filter((r) => front.includes(r));
    if (!sh.offers || sh.offers.length === 0) {
      const rng = new Rng(hashSeed(this.world.seed, this.run.gen, this.run.depth, 'shrine', this.world.rules.length));
      sh.offers = rng.shuffle([...front]).slice(0, 3);
    }
    if (sh.offers.length === 0) {
      this.log(this.lex.t('shrine.silent'), 'dim');
      sh.used = true;
      return;
    }
    this.log(this.lex.t('shrine.open'), 'rule');
    this.run.pending = { kind: 'shrine' };
  }

  private resolveShrine(rule: RuleId | null): boolean {
    const sh = this.run.floor.shrine;
    this.run.pending = null;
    if (!sh) return true;
    if (rule === null) {
      this.log(this.lex.t('shrine.stepback'), 'dim');
    } else if (sh.offers?.includes(rule)) {
      sh.used = true;
      this.adopt(rule, 'shrine');
      const p = this.run.player;
      this.count('healShrine', this.stats.maxHp - p.hp);
      p.hp = this.stats.maxHp;
      this.log(this.lex.t('shrine.heal'), 'good', true);
    }
    this.settlePending();
    return true;
  }

  /** Bring a rule into the world and let it reinterpret the current floor. */
  adopt(rule: RuleId, how: 'shrine' | 'mastery' | 'milestone') {
    if (this.has(rule)) return;
    this.world.rules.push(rule);
    this.events.push({ type: 'rule', rule, how });
    const text = this.lex.rule(rule);
    this.log(this.lex.t('rule.new', { rule: text.name, tagline: text.tagline }), 'rule');
    const p = this.run.player;
    this.reinterpretFloor(rule);
    RULES[rule].onAdopt?.(this);
    if (rule === 'peril') this.revealHarm();
    p.hp = Math.min(p.hp, this.stats.maxHp);
    this.refreshVision();
  }

  // -------------------------------------------------------------------------
  // Commerce
  // -------------------------------------------------------------------------

  /** What a merchant asks for an item here. */
  priceOf(item: Item): number {
    const C = B.commerce;
    const d = this.run.depth;
    const base =
      item.kind === 'potion' ? C.potion[0] + C.potion[1] * d
      : item.kind === 'food' ? C.food[0] + C.food[1] * d
      : item.kind === 'weapon' ? C.weapon[0] + C.weapon[1] * (item.atk ?? 0) + C.weapon[2] * d
      : item.kind === 'armor' ? C.armor[0] + C.armor[1] * (item.def ?? 0) + C.armor[2] * d
      : item.kind === 'ammo' ? C.ammoEach * (item.amount ?? 0)
      : 0;
    return Math.max(1, Math.round(base * (alt(this.ctx, 'commerce') ? C.discount : 1)));
  }

  /** What a merchant pays for it: half. */
  sellPriceOf(item: Item): number {
    return Math.floor(this.priceOf(item) / 2);
  }

  /** What a shrine asks to show other offers, or null if it can't (or already has). */
  rerollCost(): number | null {
    const sh = this.run.floor.shrine;
    if (!this.has('commerce') || !sh || sh.rerolled || sh.used) return null;
    const others = frontier(new Set(this.world.rules), { depth: this.run.depth, emergence: this.world.emergence ?? {}, pool: this.world.genome?.pool })
      .filter((r) => !sh.offers?.includes(r));
    if (!others.length) return null;
    const [base, per] = B.commerce.reroll;
    return Math.round((base + per * this.run.depth) * (alt(this.ctx, 'commerce') ? B.commerce.discount : 1));
  }

  placeMerchant() {
    const run = this.run;
    const f = run.floor;
    if (f.merchant) return;
    const g = this.genCtx('merchant');
    const p = run.player;
    const pos = randomFloorTile(f, g.rng, (x, y) =>
      Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1 ||
      (x === f.start.x && y === f.start.y) ||
      (x === f.stairs.x && y === f.stairs.y) ||
      (!!f.shrine && f.shrine.pos.x === x && f.shrine.pos.y === y) ||
      (!!f.schism && f.schism.pos.x === x && f.schism.pos.y === y) ||
      run.items.some((fi) => fi.x === x && fi.y === y) ||
      !!this.monsterAt(x, y),
    );
    if (!pos) return;
    delete f.glimmer[idx(f, pos.x, pos.y)];
    const stock: Item[] = [makeItem('potion', run.depth, g), makeItem('potion', run.depth, g)];
    if (this.has('hunger')) stock.push(makeItem('food', run.depth, g));
    if (this.has('arms')) stock.push(makeItem('weapon', run.depth + 1, g), makeItem('armor', run.depth + 1, g));
    if (this.ctx.harm === 'volley') stock.push(makeItem('ammo', run.depth, g));
    f.merchant = { pos, stock };
  }

  private buy(id: number): boolean {
    const p = this.run.player;
    const mc = this.run.floor.merchant;
    const item = mc?.stock.find((i) => i.id === id);
    if (!mc || !item) return false;
    const price = this.priceOf(item);
    if (p.gold < price) {
      this.log(this.lex.t('shop.poor'), 'dim');
      return false;
    }
    if (item.kind === 'ammo') p.ammo = (p.ammo ?? 0) + (item.amount ?? 0);
    else if (p.inventory.length >= INVENTORY_CAP) {
      this.log(this.lex.t('pack.full'), 'dim');
      return false;
    } else p.inventory.push(item);
    p.gold -= price;
    mc.stock = mc.stock.filter((i) => i !== item);
    this.count('goldSpent', price);
    this.log(this.lex.t('shop.buy', { item: itemLabel(item, this.ctx, this.lex), n: price }), 'good');
    return true;
  }

  private sell(id: number): boolean {
    const p = this.run.player;
    const mc = this.run.floor.merchant;
    const item = p.inventory.find((i) => i.id === id);
    if (!mc || !item) return false;
    const price = this.sellPriceOf(item);
    p.inventory = p.inventory.filter((i) => i !== item);
    p.gold += price;
    mc.stock.push(item);
    this.log(this.lex.t('shop.sell', { item: itemLabel(item, this.ctx, this.lex), n: price }), 'info');
    return true;
  }

  private reroll(): boolean {
    const sh = this.run.floor.shrine;
    const cost = this.rerollCost();
    const p = this.run.player;
    if (!sh || cost === null) return false;
    if (p.gold < cost) {
      this.log(this.lex.t('shop.poor'), 'dim');
      return false;
    }
    p.gold -= cost;
    this.count('goldSpent', cost);
    sh.rerolled = true;
    const others = frontier(new Set(this.world.rules), { depth: this.run.depth, emergence: this.world.emergence ?? {}, pool: this.world.genome?.pool })
      .filter((r) => !sh.offers?.includes(r));
    const rng = new Rng(hashSeed(this.world.seed, this.run.gen, this.run.depth, 'reroll', this.world.rules.length));
    sh.offers = rng.shuffle(others).slice(0, 3);
    this.log(this.lex.t('shrine.reroll'), 'rule');
    return true;
  }

  // -------------------------------------------------------------------------
  // Means of Harm: revealed with the first foes, or settled at a schism shrine
  // -------------------------------------------------------------------------

  /** Foes have arrived: say how harm works here, or raise a schism shrine to decide it. */
  private revealHarm() {
    const harm = this.world.genome?.axioms.harm;
    if (!harm) {
      this.placeSchism();
      this.log(this.lex.t('schism.appears'), 'rule', true);
      return;
    }
    this.announceHarm(harm, 'rolled');
  }

  private announceHarm(harm: HarmId, how: 'rolled' | 'schism') {
    const m = this.lex.means(harm);
    this.log(this.lex.t('axiom.harm', { name: m.name, tagline: m.tagline }), 'rule');
    this.events.push({ type: 'axiom', harm, how });
    const p = this.run.player;
    if (harm === 'volley') p.ammo = Math.max(p.ammo ?? 0, B.harm.startAmmo);
    if (harm === 'arcanum') p.mana = this.stats.maxMana;
  }

  /** One schism shrine per floor while the question is open, somewhere in the open. */
  private placeSchism() {
    const f = this.run.floor;
    if (f.schism || this.harmSettled) return;
    const g = this.genCtx('schism');
    const p = this.run.player;
    const pos = randomFloorTile(f, g.rng, (x, y) =>
      (x === p.x && y === p.y) ||
      (x === f.start.x && y === f.start.y) ||
      (x === f.stairs.x && y === f.stairs.y) ||
      (!!f.shrine && f.shrine.pos.x === x && f.shrine.pos.y === y) ||
      this.run.items.some((fi) => fi.x === x && fi.y === y) ||
      !!this.monsterAt(x, y),
    );
    if (!pos) return;
    delete f.glimmer[idx(f, pos.x, pos.y)];
    f.schism = { pos, offers: g.rng.shuffle([...HARMS]).slice(0, B.harm.schismOffers), used: false };
  }

  private resolveSchism(harm: HarmId | null): boolean {
    const sc = this.run.floor.schism;
    this.run.pending = null;
    if (!sc) return true;
    if (harm === null || !sc.offers.includes(harm)) {
      this.log(this.lex.t('schism.stepback'), 'dim');
    } else {
      sc.used = true;
      this.world.genome.axioms.harm = harm;
      // A new means brings its own words for implements, shots and blows.
      this.lex = lexiconFor(this.world, this.lex.plain);
      this.announceHarm(harm, 'schism');
    }
    this.settlePending();
    return true;
  }

  /**
   * Foes the player could harm right now with an aimed use of their means,
   * nearest first. Strike reaches only the adjacent.
   */
  targets(): Monster[] {
    const { player: p, floor: f, monsters } = this.run;
    const reach = this.means.reach;
    const range = this.stats.range;
    let out: Monster[];
    if (reach === 'adjacent') out = monsters.filter((m) => cheb(m, p) === 1);
    else if (reach === 'earshot') {
      const heard = distanceMap(f, p);
      out = monsters.filter((m) => {
        const d = heard[idx(f, m.x, m.y)];
        return d > 0 && d <= range;
      });
    } else {
      out = monsters.filter((m) => {
        if (!this.isVisible(m.x, m.y)) return false;
        const path = ray(f, p, m, range);
        const at = path.findIndex((t) => t.x === m.x && t.y === m.y);
        if (at < 0) return false;
        // A shot stops at the first body; a bolt passes through.
        return reach === 'pierce' || !path.slice(0, at).some((t) => this.monsterAt(t.x, t.y));
      });
    }
    return out.sort((a, b) => cheb(a, p) - cheb(b, p) || a.id - b.id);
  }

  /** Aimed harm. Returns turns spent (0 if nothing happened). */
  private fire(at?: Pos): number {
    const p = this.run.player;
    const f = this.run.floor;
    const means = this.means;
    const s = this.stats;
    if (means.reach === 'adjacent') {
      this.log(this.lex.t('fire.strike'), 'dim');
      return 0;
    }
    const goal = at ?? this.targets()[0];
    if (!goal || (goal.x === p.x && goal.y === p.y)) {
      this.log(this.lex.t('fire.none'), 'dim');
      return 0;
    }
    if (means.reach === 'earshot') {
      const m = this.monsterAt(goal.x, goal.y);
      const heard = distanceMap(f, p)[idx(f, goal.x, goal.y)];
      if (!m || heard <= 0 || heard > s.range) {
        this.log(this.lex.t('fire.none'), 'dim');
        return 0;
      }
      this.events.push({ type: 'shot', path: [{ x: m.x, y: m.y }] });
      this.harm(m);
      return s.attackCost;
    }
    const path = ray(f, p, goal, s.range);
    if (means.reach === 'shot') {
      if ((p.ammo ?? 0) <= 0) {
        this.log(this.lex.t('volley.empty'), 'dim', true);
        return 0;
      }
      p.ammo = (p.ammo ?? 0) - 1;
      this.count('shots');
      const hit = path.findIndex((t) => this.monsterAt(t.x, t.y));
      const flown = hit >= 0 ? path.slice(0, hit + 1) : path;
      this.events.push({ type: 'shot', path: flown });
      const land = flown[flown.length - 1] ?? { x: p.x, y: p.y };
      if (hit >= 0) this.harm(this.monsterAt(path[hit].x, path[hit].y)!);
      else this.log(this.lex.t('volley.wide'), 'dim');
      // The spent shot lands where it stopped, unless it broke.
      const brittle = this.has('durability') ? B.harm.ammoBreakDurability : B.harm.ammoBreak;
      if (!this.rng.chance(brittle)) this.dropAmmo(land, 1);
      else this.count('shotsBroken');
      return s.attackCost;
    }
    // Arcanum: a bolt along the line, through every body on it.
    if (p.mana < B.harm.boltCost) {
      this.log(this.lex.t('arcanum.nomana', { n: B.harm.boltCost }), 'dim');
      return 0;
    }
    p.mana -= B.harm.boltCost;
    this.events.push({ type: 'shot', path });
    const struck = path.map((t) => this.monsterAt(t.x, t.y)).filter((m): m is Monster => !!m);
    if (!struck.length) this.log(this.lex.t('arcanum.fizzle'), 'dim');
    for (const m of struck) if (this.run.monsters.includes(m)) this.harm(m);
    return s.attackCost;
  }

  private dropAmmo(at: Pos, n: number) {
    const run = this.run;
    const pile = run.items.find((fi) => fi.x === at.x && fi.y === at.y && fi.item.kind === 'ammo');
    if (pile) {
      pile.item.amount = (pile.item.amount ?? 0) + n;
      return;
    }
    const item: Item = { id: run.nextId++, kind: 'ammo', key: 'ammo', name: this.lex.role('ammos'), amount: n, weight: 0, element: null, dur: 0, maxDur: 0 };
    run.items.push({ item, x: at.x, y: at.y });
  }

  /** Volley and Arcanum: walking into a foe pushes it back a tile, and it loses its footing. */
  private shove(m: Monster, dx: number, dy: number) {
    const f = this.run.floor;
    const nx = m.x + dx;
    const ny = m.y + dy;
    m.aware = true;
    const name = this.monsterName(m);
    if (passable(f, nx, ny) && !this.monsterAt(nx, ny)) {
      m.x = nx;
      m.y = ny;
      m.stun = Math.max(m.stun, 1);
      this.log(this.lex.t('shove', { foe: name }), 'info');
    } else {
      this.log(this.lex.t('shove.stuck', { foe: name }), 'dim');
    }
  }

  /**
   * What a rule does to the current floor when it arrives: the same whether it
   * arrives while you stand here or while you're on another floor.
   */
  private reinterpretFloor(rule: RuleId) {
    RULES[rule].reinterpretFloor?.(this);
  }

  // RuleHost: what rule modules may do to the current floor.

  spawnLoot(rule: RuleId) {
    const run = this.run;
    const p = run.player;
    const taken = (x: number, y: number) =>
      (x === p.x && y === p.y) || run.items.some((fi) => fi.x === x && fi.y === y);
    const items = itemsForRule(rule, run.floor, this.genCtx(`adopt-${rule}`));
    run.items.push(...scatter(items, run.floor, this.genCtx(`scatter-${rule}`), taken));
    this.countSpawned(items);
  }

  spawnFoes(fraction: number, minDistance: number) {
    const run = this.run;
    const p = run.player;
    const f = run.floor;
    const count = Math.max(2, Math.ceil(monsterCount(f, this.ctx) * fraction));
    const sh = f.shrine?.pos;
    run.monsters.push(
      ...spawnMonsters(f, this.genCtx('adopt-peril'), count, (x, y) =>
        cheb({ x, y }, p) < minDistance || (!!sh && sh.x === x && sh.y === y),
      ),
    );
  }

  /**
   * Halls arriving mid-floor: the single room becomes the largest room of the
   * full floor. What you've seen and the shrine you used stay; the stairs move,
   * and the new rooms fill with whatever the active rules put there.
   */
  expandFloor() {
    const run = this.run;
    const old = run.floor;
    if (!old.solo) return;
    const full = generateLayout(this.world.seed, run.depth, layoutOpts(this.world));
    full.shrine = old.shrine;
    if (old.shrine) delete full.glimmer[idx(full, old.shrine.pos.x, old.shrine.pos.y)];
    // The stairs up stay where you came in; the down stairs move to the full floor's.
    if (run.depth >= 2) {
      const fs = full.start;
      if (full.tiles[idx(full, fs.x, fs.y)] === T_UP) full.tiles[idx(full, fs.x, fs.y)] = T_FLOOR;
      const os = old.start;
      if (!(os.x === full.stairs.x && os.y === full.stairs.y)) full.tiles[idx(full, os.x, os.y)] = T_UP;
      delete full.glimmer[idx(full, os.x, os.y)];
    }
    full.start = old.start;
    for (let i = 0; i < old.explored.length; i++) if (old.explored[i]) full.explored[i] = 1;
    run.floor = full;
    const room = soloRoom(full);
    const p = run.player;
    const inRoom = (x: number, y: number) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
    const taken = (x: number, y: number) =>
      inRoom(x, y) || this.run.items.some((fi) => fi.x === x && fi.y === y) || this.monsterAt(x, y) !== undefined;
    const g = this.genCtx('expand');
    if (this.has('peril')) run.monsters.push(...spawnMonsters(full, g, monsterCount(full, this.ctx), taken));
    const loot = lootFor(full, g);
    run.items.push(...scatter(loot, full, g, taken));
    this.countSpawned(loot);
    if (p.x === full.stairs.x && p.y === full.stairs.y) return;
    this.log(this.lex.t('adopt.halls'), 'dim');
  }

  private resolveLevelUp(stat: 'str' | 'agi' | 'vit'): boolean {
    const p = this.run.player;
    p[stat] += 1;
    if (stat === 'vit') p.hp += 4;
    p.hp = Math.min(p.hp, this.stats.maxHp);
    this.run.pendingLevelUps -= 1;
    this.run.pending = null;
    this.log(this.lex.t('levelup.stat', { stat: this.lex.t(`stat.${stat}`), n: p[stat] }), 'good');
    this.settlePending();
    return true;
  }

  private visitGrave(g: Grave) {
    this.log(this.lex.t('grave.epitaph', { name: g.name, gen: g.gen, epitaph: g.epitaph }), 'dim');
    if (g.looted || !g.item) return;
    const usable =
      (g.item.kind === 'weapon' || g.item.kind === 'armor') ? this.has('arms')
      : g.item.kind === 'food' ? this.has('hunger')
      : this.has('things');
    if (!usable) {
      this.log(this.lex.t('grave.unusable'), 'dim');
      return;
    }
    if (this.run.player.inventory.length >= INVENTORY_CAP) {
      this.log(this.lex.t('grave.full'), 'dim');
      return;
    }
    g.looted = true;
    this.run.player.inventory.push(g.item);
    this.log(this.lex.t('grave.recover', { item: itemLabel(g.item, this.ctx, this.lex) }), 'good', true);
  }

  // -------------------------------------------------------------------------
  // Combat
  // -------------------------------------------------------------------------

  private wear(): number {
    return alt(this.ctx, 'durability') ? 2 : 1;
  }

  /**
   * Harm one foe with the world's means. Every channel shares this: hit
   * chance, the implement's element, sneak attacks, armour, wear, stagger.
   * The words differ by means; the lexicon picks them.
   */
  private harm(m: Monster) {
    const s = this.stats;
    const p = this.run.player;
    const name = this.monsterName(m);
    const sneak = !m.aware && s.sneak > 1;
    m.aware = true;
    if (this.ctx.harm !== 'strike') m.heard = this.run.turn;
    if (this.ctx.harm === 'discourse') this.overheard(m);
    if (s.hit < 1 && !this.rng.chance(s.hit)) {
      this.log(this.lex.t('attack.miss', { foe: name }), 'dim');
      return;
    }
    let dmg = Math.ceil(s.attack * B.harm.power[this.ctx.harm]);
    const notes: string[] = [];
    const w = p.weapon;
    if (w?.element && m.element && this.has('elements') && this.has('arms')) {
      if (w.element === m.element) {
        dmg = Math.ceil(dmg / 2);
        notes.push(this.lex.t('attack.note.resist'));
      } else {
        dmg *= 2;
        notes.push(this.lex.t('attack.note.weak'));
      }
    }
    if (sneak) {
      dmg *= s.sneak;
      notes.push(this.lex.t('attack.note.sneak'));
    }
    dmg = Math.max(1, dmg - m.def);
    if (w && this.has('durability') && this.has('arms')) {
      w.dur -= this.wear();
      if (w.dur <= 0) {
        dmg *= 3;
        p.weapon = null;
        notes.push(this.lex.t('attack.note.shatter', { item: this.lex.itemName(w) }));
      }
    }
    m.hp -= dmg;
    const noteText = notes.length ? this.lex.t('attack.notes', { list: notes.join(this.lex.t('list.sep')) }) : '';
    this.log(this.lex.t('attack.hit', { foe: name, n: dmg, notes: noteText }), 'info');
    if (m.hp <= 0) {
      this.kill(m);
      return;
    }
    if (s.stagger > 0 && this.rng.chance(s.stagger)) {
      m.stun = Math.max(m.stun, 1);
      this.log(this.lex.t('attack.stagger', { foe: name }), 'good');
    }
  }

  /** Discourse: everyone within earshot hears what you said, and turns to look. */
  private overheard(target: Monster) {
    const f = this.run.floor;
    const heard = distanceMap(f, this.run.player);
    let n = 0;
    for (const m of this.run.monsters) {
      if (m === target || m.aware) continue;
      const d = heard[idx(f, m.x, m.y)];
      if (d > 0 && d <= this.stats.range) {
        m.aware = true;
        n++;
      }
    }
    if (n) this.log(this.lex.t('discourse.overheard', { n }), 'dim');
  }

  private monsterAttack(m: Monster, ranged = false) {
    const s = this.stats;
    const p = this.run.player;
    const name = this.monsterName(m);
    if (s.enemyHit < 1 && !this.rng.chance(s.enemyHit)) {
      this.log(this.lex.t(ranged ? 'foe.shoots.miss' : 'foe.miss', { foe: name }), 'dim');
      return;
    }
    const guard = !ranged && this.ctx.harm === 'strike' ? B.harm.strikeGuard : 0;
    const dmg = Math.max(1, m.atk - s.defense - guard);
    const a = p.armor;
    if (a && this.has('durability') && this.has('arms')) {
      a.dur -= this.wear();
      if (a.dur <= 0) {
        p.armor = null;
        this.log(this.lex.t('armor.breaks', { item: this.lex.itemName(a) }), 'bad', true);
      }
    }
    p.hp -= dmg;
    this.count('damageTaken', dmg);
    this.log(this.lex.t(ranged ? 'foe.shoots' : 'foe.hit', { foe: name, n: dmg }), 'bad');
    if (p.hp <= 0) this.die(this.lex.t('cause.slain', { a: article(name), foe: name, n: this.run.depth }));
  }

  monsterName(m: Monster): string {
    const base = this.lex.foe(m.kind).name;
    if (m.element && this.has('elements')) return this.lex.t('foe.elemental', { element: this.lex.element(m.element).adj, foe: base });
    return base;
  }

  private kill(m: Monster) {
    const run = this.run;
    const p = run.player;
    run.monsters = run.monsters.filter((o) => o !== m);
    p.kills += 1;
    this.log(this.lex.t('foe.dies', { foe: this.monsterName(m) }), 'good', true);
    if (this.has('growth')) {
      p.xp += m.xp;
      while (p.xp >= xpNeeded(p.level, this.ctx)) {
        p.xp -= xpNeeded(p.level, this.ctx);
        p.level += 1;
        p.hp += 2;
        run.pendingLevelUps += 1;
        this.log(this.lex.t('levelup.reached', { n: p.level }), 'rule', true);
      }
    }
    const drops: Item[] = [];
    const g: GenCtx = { rng: this.rng, ctx: this.ctx, lex: this.lex, nextId: () => run.nextId++ };
    const D = B.drops;
    const bonus = this.has('bestiary') ? D.bestiaryMult : 1;
    if (this.has('things') && this.rng.chance(D.gold * bonus)) drops.push(makeItem('gold', run.depth, g));
    if (this.has('things') && this.rng.chance(D.potion * bonus)) drops.push(makeItem('potion', run.depth, g));
    if (this.has('hunger') && this.rng.chance(D.food * bonus)) drops.push(makeItem('food', run.depth, g));
    if (this.has('arms') && this.rng.chance(D.arms * bonus)) drops.push(makeItem(this.rng.chance(0.6) ? 'weapon' : 'armor', run.depth, g));
    if (this.ctx.harm === 'volley' && this.rng.chance(B.harm.ammoDrop)) drops.push(makeItem('ammo', run.depth, g));
    for (const item of drops) run.items.push({ item, x: m.x, y: m.y });
    this.countSpawned(drops);
    this.count('kills');
    if (!this.has('things') && p.kills >= MASTERY_KILLS) this.adopt('things', 'mastery');
  }

  private die(cause: string) {
    const run = this.run;
    const p = run.player;
    if (run.over) return;
    run.over = true;
    run.cause = cause;
    p.hp = 0;
    this.log(this.lex.t('death', { cause }), 'bad');
    this.world.history.push({
      gen: run.gen,
      name: p.name,
      depth: run.depth,
      level: p.level,
      turns: run.turn,
      cause,
      rules: [...this.world.rules],
    });
    const keep = p.weapon ?? p.armor ?? p.inventory.find((i) => i.kind === 'potion') ?? null;
    this.world.graves.push({
      gen: run.gen,
      depth: run.depth,
      x: p.x,
      y: p.y,
      name: p.name,
      epitaph: cause,
      item: keep,
      looted: false,
    });
    this.events.push({ type: 'death' });
  }

  // -------------------------------------------------------------------------
  // Time
  // -------------------------------------------------------------------------

  private passTime(turns: number) {
    for (let t = 0; t < turns && !this.run.over; t++) this.tick();
    this.refreshVision();
  }

  private tick() {
    const run = this.run;
    const p = run.player;
    run.turn += 1;
    const dist = distanceMap(run.floor, p);
    for (const m of [...run.monsters]) {
      if (!run.monsters.includes(m)) continue;
      const speed = MONSTERS[m.kind].speed;
      const acts = speed >= 1 ? speed : run.turn % Math.round(1 / speed) === 0 ? 1 : 0;
      // Speed buys extra movement, never extra attacks.
      for (let k = 0; k < acts && !run.over && run.monsters.includes(m); k++) {
        if (this.monsterAct(m, dist)) break;
      }
      if (run.over) return;
    }
    this.environment();
    if (run.over) return;
    if (this.ctx.harm === 'discourse') this.composure();
    if (this.has('hunger')) {
      const H = B.hunger;
      p.satiety = Math.max(0, p.satiety - H.drainPerTurn * (alt(this.ctx, 'hunger') ? H.leanMult : 1));
      this.count('hungerTurns');
      if (p.satiety <= 0) {
        p.starveClock += 1;
        this.count('starvingTurns');
        if (p.starveClock % H.starveEvery === 0) {
          p.hp -= 1;
          this.count('damageStarving');
          this.log(this.lex.t('starving'), 'bad');
          if (p.hp <= 0) return this.die(this.lex.t('cause.starved', { n: run.depth }));
        }
      } else if (p.satiety >= MAX_SATIETY * H.regenAbove) {
        p.regenClock += 1;
        this.count('regenTurns');
        if (p.regenClock >= H.regenEvery) {
          p.regenClock = 0;
          const before = p.hp;
          p.hp = Math.min(this.stats.maxHp, p.hp + 1);
          this.count('healRegen', p.hp - before);
        }
      }
    }
    const arcanum = this.ctx.harm === 'arcanum';
    if (this.has('arcana') || arcanum) {
      p.manaClock += 1;
      const every = arcanum
        ? Math.ceil(B.harm.arcanumManaEvery / (this.has('arcana') ? 2 : 1))
        : alt(this.ctx, 'arcana') ? B.arcana.leyManaEvery : B.arcana.manaEvery;
      if (p.manaClock >= every) {
        p.manaClock = 0;
        p.mana = Math.min(this.stats.maxMana, p.mana + 1);
      }
    }
  }

  /** Discourse: a foe left alone gathers itself again. */
  private composure() {
    const E = B.harm.composureEvery;
    const turn = this.run.turn;
    if (turn % E !== 0) return;
    for (const m of this.run.monsters) {
      if (m.hp < m.maxHp && turn - (m.heard ?? -E) >= E) m.hp += 1;
    }
  }

  /** Ember stones burn whoever stands on them at the end of a turn. */
  private environment() {
    if (!this.has('elements')) return;
    const run = this.run;
    const f = run.floor;
    const burn = alt(this.ctx, 'elements') ? B.elements.wildfireBurn : B.elements.emberBurn;
    const p = run.player;
    if (f.glimmer[idx(f, p.x, p.y)] === 'ember') {
      p.hp -= burn;
      this.count('damageTaken', burn);
      this.log(this.lex.t('ember.you', { n: burn }), 'bad');
      if (p.hp <= 0) return this.die(this.lex.t('cause.burned', { a: article(this.lex.element('ember').adj), n: run.depth }));
    }
    for (const m of [...run.monsters]) {
      if (f.glimmer[idx(f, m.x, m.y)] !== 'ember' || m.element === 'ember') continue;
      m.hp -= burn;
      if (this.isVisible(m.x, m.y)) this.log(this.lex.t('ember.foe', { foe: this.monsterName(m) }), 'good');
      if (m.hp <= 0) this.kill(m);
    }
  }

  /** One monster action. Returns true if it attacked (which ends its turn). */
  private monsterAct(m: Monster, dist: Int16Array): boolean {
    const run = this.run;
    const p = run.player;
    const f = run.floor;
    if (m.stun > 0) {
      m.stun -= 1;
      return false;
    }
    const dark = this.has('darkness');
    const notice = dark ? 4 : 8;
    const d2 = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
    const sees = d2 <= notice * notice && lineOfSight(f, m, p);
    if (!m.aware && sees) m.aware = true;
    else if (m.aware && dark && !sees && this.rng.chance(0.15)) m.aware = false;

    if (m.aware && this.ctx.harm === 'volley' && MONSTERS[m.kind].skirmish) {
      const d = cheb(m, p);
      // Keep their distance if they can; shoot when they have a line.
      if (d <= B.harm.skirmishKeep) {
        const away = DIRS.filter((s) => {
          const nx = m.x + s.x;
          const ny = m.y + s.y;
          return passable(f, nx, ny) && !this.monsterAt(nx, ny) && !(nx === p.x && ny === p.y) && cheb({ x: nx, y: ny }, p) > d;
        });
        if (away.length) {
          const s = this.rng.pick(away);
          m.x += s.x;
          m.y += s.y;
          return false;
        }
      }
      if (d > 1 && d <= B.harm.skirmishRange && lineOfSight(f, m, p)) {
        this.monsterAttack(m, true);
        return true;
      }
    }
    if (m.aware && cheb(m, p) === 1) {
      this.monsterAttack(m);
      return true;
    }
    let step: Pos | null = null;
    const free = (x: number, y: number) =>
      passable(f, x, y) && !this.monsterAt(x, y) && !(x === p.x && y === p.y);
    const randomStep = () => {
      const opts = DIRS.filter((d) => free(m.x + d.x, m.y + d.y));
      return opts.length ? this.rng.pick(opts) : null;
    };
    if (m.aware) {
      if (MONSTERS[m.kind].erratic && this.rng.chance(0.4)) step = randomStep();
      else {
        const here = dist[idx(f, m.x, m.y)];
        let best = here < 0 ? Infinity : here;
        for (const d of DIRS) {
          const nx = m.x + d.x;
          const ny = m.y + d.y;
          if (!free(nx, ny)) continue;
          const nd = dist[idx(f, nx, ny)];
          if (nd >= 0 && nd < best) {
            best = nd;
            step = d;
          }
        }
      }
    } else if (this.rng.chance(0.25)) {
      step = randomStep();
    }
    if (!step) return false;
    m.x += step.x;
    m.y += step.y;
    if (this.has('elements') && f.glimmer[idx(f, m.x, m.y)] === 'frost' && m.element !== 'frost') {
      m.stun = Math.max(m.stun, 1);
      if (this.isVisible(m.x, m.y)) this.log(this.lex.t('frost.foe', { foe: this.monsterName(m) }), 'good');
    }
    return false;
  }
}

function layoutOpts(world: World): LayoutOpts {
  return { halls: world.rules.includes('halls'), sprawl: world.rules.includes('halls') && world.variants.halls === 'alt' };
}
