import {
  alt,
  BASE_STAT,
  ctxOf,
  derive,
  frontier,
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
import { DIRS, distanceMap, generateLayout, idx, passable, soloRoom, type LayoutOpts } from './dungeon.ts';
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
  | { type: 'levelup'; stat: 'str' | 'agi' | 'vit' };

export type GameEvent =
  | { type: 'rule'; rule: RuleId; how: 'shrine' | 'mastery' | 'milestone' }
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

/** "a" or "an" for a creature name. */
export const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export class Game {
  world: World;
  run: RunState;
  rng: Rng;
  events: GameEvent[] = [];
  visible = new Set<number>();
  /** A player preference, not part of the run: set by the UI from its options. */
  autoPickup: AutoPickup = 'all';
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

  constructor(world: World, run: RunState) {
    this.world = world;
    this.run = run;
    this.rng = new Rng(run.rng);
    this.refreshVision();
  }

  /** Start a new character in `world`. The world's rulebook carries over untouched. */
  static start(world: World): Game {
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
    const game = new Game(world, run);
    game.enterFloor(1);
    const p = run.player;
    const d = game.stats;
    p.hp = d.maxHp;
    p.mana = d.maxMana;
    if (world.rules.length === 0) {
      game.log('You wake in a quiet room. A shrine hums in the corner; stairs lead down.', 'info');
      game.log('Move with the arrow keys or by tapping the map; hold a spot to walk there. Step onto the shrine (Ω) to change the world.', 'dim');
    } else {
      game.log(`${p.name} descends into ${world.name}, heir to ${world.rules.length} rules.`, 'info');
    }
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

  /** Persistable state, with the RNG position folded in. */
  snapshot(): RunState {
    this.run.rng = this.rng.state;
    return this.run;
  }

  log(text: string, tone: Tone = 'info') {
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

  private genCtx(tag: string | number): GenCtx {
    const rng = new Rng(hashSeed(this.world.seed, this.run.gen, this.run.depth, tag));
    return { rng, ctx: this.ctx, nextId: () => this.run.nextId++ };
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
      if (missed.length) this.log('This floor has changed since you were last here.', 'dim');
    } else {
      run.floor = generateLayout(this.world.seed, depth, layoutOpts(this.world));
      const { monsters, items } = populate(run.floor, this.genCtx('populate'));
      run.monsters = monsters;
      run.items = items;
      this.countSpawned(items.map((fi) => fi.item));
      this.count('floorsEntered');
    }
    arrive();
    this.clearArrival();
    this.world.deepest = Math.max(this.world.deepest, depth);
    this.refreshVision();
    if (stored) return;
    const graves = this.floorGraves().filter((g) => !g.looted);
    if (graves.length) this.log(`You sense ${graves.length === 1 ? 'a grave' : `${graves.length} graves`} on this floor.`, 'dim');
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
    return frontier(new Set(this.world.rules), { depth: this.run.depth, emergence: this.world.emergence ?? {} }).length > 0;
  }

  /** Taking any stairs: an unanswered shrine goes dark, and the floor is kept for your return. */
  private leaveFloor() {
    const run = this.run;
    const sh = run.floor.shrine;
    if (sh && !sh.used) {
      if (this.shrineWouldOffer()) this.log('Behind you, the unanswered shrine goes dark.', 'dim');
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
      if (run.pending.kind === 'levelup' && a.type === 'levelup') return this.resolveLevelUp(a.stat);
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
      this.playerAttack(m);
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
      const auto = this.autoPickup === 'all' || (this.autoPickup === 'gold' && fi.item.kind === 'gold');
      if (auto && this.take(fi, true)) continue;
      const label = itemLabel(fi.item, this.ctx);
      left.push(fi.item.kind === 'gold' ? label : `${article(label)} ${label}`);
    }
    if (left.length) {
      const what = left.length === 1 ? left[0] : `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}`;
      this.log(`You see ${what} here. Press g to pick up.`, 'info');
    }
    const g = floor.glimmer[idx(floor, p.x, p.y)];
    if (g) {
      if (this.has('elements')) {
        if (g === 'frost') {
          this.log('Frost grips your feet. You lose a turn.', 'bad');
          extra += 1;
        }
      } else {
        this.log(g === 'ember' ? 'The stone here is faintly warm.' : 'The stone here is faintly cold.', 'dim');
      }
    }
    if (p.x === floor.stairs.x && p.y === floor.stairs.y) this.log('Stairs lead down. Press > to descend.', 'info');
    if (floor.tiles[idx(floor, p.x, p.y)] === T_UP) this.log(`Stairs lead up to depth ${this.run.depth - 1}. Press < to climb.`, 'info');
    const sh = floor.shrine;
    if (sh && !sh.used && sh.pos.x === p.x && sh.pos.y === p.y) this.openShrine();
    const grave = this.graveAt(p.x, p.y);
    if (grave) this.visitGrave(grave);
    return extra;
  }

  private descend(): boolean {
    const { player: p, floor } = this.run;
    if (p.x !== floor.stairs.x || p.y !== floor.stairs.y) {
      this.log('There are no stairs here.', 'dim');
      return false;
    }
    this.leaveFloor();
    const depth = this.run.depth + 1;
    // Imposed rules arrive by themselves once they've emerged and can stand.
    for (const id of RULE_ORDER) {
      const def = RULES[id];
      if (!def.imposed || this.has(id) || emergenceOf(this.world, id) > depth) continue;
      if (def.prereqs.every((r) => this.has(r))) this.adopt(id, 'milestone');
    }
    this.enterFloor(depth, 'down');
    this.events.push({ type: 'floor', depth });
    this.log(`You descend to depth ${depth}.`, 'info');
    return true;
  }

  private ascend(): boolean {
    const { player: p, floor } = this.run;
    if (this.run.depth <= 1 || floor.tiles[idx(floor, p.x, p.y)] !== T_UP) {
      this.log('There are no stairs up here.', 'dim');
      return false;
    }
    this.leaveFloor();
    const depth = this.run.depth - 1;
    this.enterFloor(depth, 'up');
    this.events.push({ type: 'floor', depth });
    this.log(`You climb back up to depth ${depth}.`, 'info');
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
      this.log(`You drink the potion and recover ${p.hp - before} HP.`, 'good');
    } else if (item.kind === 'food') {
      if (!this.has('hunger')) {
        this.log('You are not hungry. You are never hungry.', 'dim');
        return 0;
      }
      const before = p.satiety;
      p.satiety = Math.min(MAX_SATIETY, p.satiety + (item.nourish ?? 0));
      this.count('satietyEaten', p.satiety - before);
      this.count('satietyWasted', (item.nourish ?? 0) - (p.satiety - before));
      this.count('foodEaten');
      this.log(`You eat the ${item.name}.`, 'good');
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
    const label = itemLabel(item, this.ctx);
    this.log(`You ${slot === 'weapon' ? 'wield' : 'don'} the ${label}.`, 'good');
    if (this.has('weight') && weightOf(item, this.ctx) > p.str) {
      this.log(`The ${label} is heavier than your strength. ${slot === 'weapon' ? 'Attacks' : 'Moving'} will take 2 turns.`, 'bad');
    }
    return 1;
  }

  private unequip(slot: 'weapon' | 'armor'): number {
    const p = this.run.player;
    const item = p[slot];
    if (!item) return 0;
    if (p.inventory.length >= INVENTORY_CAP) {
      this.log('Your pack is full.', 'dim');
      return 0;
    }
    p[slot] = null;
    p.inventory.push(item);
    this.log(`You put away the ${itemLabel(item, this.ctx)}.`, 'info');
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
      this.log(`You pick up ${fi.item.amount} gold.`, 'good');
    } else if (p.inventory.length >= INVENTORY_CAP) {
      if (!quietWhenFull) this.log(`Your pack is full; you leave the ${itemLabel(fi.item, this.ctx)}.`, 'dim');
      return false;
    } else {
      p.inventory.push(fi.item);
      this.log(`You pick up the ${itemLabel(fi.item, this.ctx)}.`, 'good');
    }
    this.run.items = this.run.items.filter((o) => o !== fi);
    return true;
  }

  /** Deliberate pickup costs a turn; walking past is free. */
  private pickup(id?: number): number {
    const here = this.itemsHere().filter((fi) => id === undefined || fi.item.id === id);
    if (!here.length) {
      this.log('There is nothing here to pick up.', 'dim');
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
    this.log(`You drop the ${itemLabel(item, this.ctx)}.`, 'info');
    return 1;
  }

  private ability(which: 'cleave' | 'mend'): number {
    const p = this.run.player;
    if (!this.has('arcana')) return 0;
    const costMana = which === 'cleave' ? CLEAVE_COST : MEND_COST;
    if (p.mana < costMana) {
      this.log(`Not enough mana (${which === 'cleave' ? 'Cleave' : 'Mend'} needs ${costMana}).`, 'dim');
      return 0;
    }
    if (which === 'cleave') {
      const targets = this.run.monsters.filter((m) => cheb(m, p) === 1);
      if (!targets.length) {
        this.log('Nothing to cleave.', 'dim');
        return 0;
      }
      p.mana -= costMana;
      this.log('You cleave in a wide arc!', 'good');
      for (const m of targets) if (this.run.monsters.includes(m)) this.playerAttack(m);
      return this.stats.attackCost;
    }
    p.mana -= costMana;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + Math.ceil(this.stats.maxHp * B.arcana.mendFraction));
    this.count('healMend', p.hp - before);
    this.log(`Warmth knits your wounds: +${p.hp - before} HP.`, 'good');
    return 1;
  }

  // -------------------------------------------------------------------------
  // Shrines, rules, level-ups
  // -------------------------------------------------------------------------

  private openShrine() {
    const sh = this.run.floor.shrine!;
    const front = frontier(new Set(this.world.rules), { depth: this.run.depth, emergence: this.world.emergence ?? {} });
    if (sh.offers) sh.offers = sh.offers.filter((r) => front.includes(r));
    if (!sh.offers || sh.offers.length === 0) {
      const rng = new Rng(hashSeed(this.world.seed, this.run.gen, this.run.depth, 'shrine', this.world.rules.length));
      sh.offers = rng.shuffle([...front]).slice(0, 3);
    }
    if (sh.offers.length === 0) {
      this.log('The shrine is silent. There is nothing left for it to teach.', 'dim');
      sh.used = true;
      return;
    }
    this.log('A Rule Shrine hums. It offers to change the world.', 'rule');
    this.run.pending = { kind: 'shrine' };
  }

  private resolveShrine(rule: RuleId | null): boolean {
    const sh = this.run.floor.shrine;
    this.run.pending = null;
    if (!sh) return true;
    if (rule === null) {
      this.log('You step back from the shrine. It will wait — for this floor.', 'dim');
    } else if (sh.offers?.includes(rule)) {
      sh.used = true;
      this.adopt(rule, 'shrine');
      const p = this.run.player;
      this.count('healShrine', this.stats.maxHp - p.hp);
      p.hp = this.stats.maxHp;
      this.log('The shrine’s light washes over you. You are fully healed.', 'good');
    }
    this.settlePending();
    return true;
  }

  /** Bring a rule into the world and let it reinterpret the current floor. */
  adopt(rule: RuleId, how: 'shrine' | 'mastery' | 'milestone') {
    if (this.has(rule)) return;
    this.world.rules.push(rule);
    this.events.push({ type: 'rule', rule, how });
    const def = RULES[rule];
    this.log(`NEW RULE — ${def.name}: ${def.tagline}`, 'rule');
    const p = this.run.player;
    this.reinterpretFloor(rule);
    switch (rule) {
      case 'peril':
        this.log('Rats skitter out of the walls.', 'bad');
        break;
      case 'things':
        this.log('Objects shimmer into existence around you.', 'dim');
        break;
      case 'hunger':
        p.satiety = MAX_SATIETY;
        break;
      case 'darkness':
        this.run.floor.explored.fill(0);
        break;
      case 'arcana':
        p.mana = this.stats.maxMana;
        break;
      case 'elements': {
        const n = Object.keys(this.run.floor.glimmer).length;
        if (n) this.log(`${n} glimmering stones flare into ember and frost.`, 'dim');
        break;
      }
      default:
        break;
    }
    p.hp = Math.min(p.hp, this.stats.maxHp);
    this.refreshVision();
  }

  /**
   * What a rule does to the current floor when it arrives: the same whether it
   * arrives while you stand here or while you're on another floor.
   */
  private reinterpretFloor(rule: RuleId) {
    const run = this.run;
    const p = run.player;
    const taken = (x: number, y: number) =>
      (x === p.x && y === p.y) || run.items.some((fi) => fi.x === x && fi.y === y);
    const spawn = (r: RuleId) => {
      const items = itemsForRule(r, run.floor, this.genCtx(`adopt-${r}`));
      run.items.push(...scatter(items, run.floor, this.genCtx(`scatter-${r}`), taken));
      this.countSpawned(items);
    };
    switch (rule) {
      case 'halls':
        this.expandFloor();
        break;
      case 'peril': {
        const f = run.floor;
        const count = Math.max(2, Math.ceil(monsterCount(f, this.ctx) * 0.6));
        const sh = f.shrine?.pos;
        run.monsters.push(
          ...spawnMonsters(f, this.genCtx('adopt-peril'), count, (x, y) =>
            cheb({ x, y }, p) < 3 || (!!sh && sh.x === x && sh.y === y),
          ),
        );
        break;
      }
      case 'things':
      case 'arms':
      case 'hunger':
        spawn(rule);
        break;
      case 'darkness':
        for (const m of run.monsters) m.aware = false;
        break;
      default:
        break;
    }
  }

  /**
   * Halls arriving mid-floor: the single room becomes the largest room of the
   * full floor. What you've seen and the shrine you used stay; the stairs move,
   * and the new rooms fill with whatever the active rules put there.
   */
  private expandFloor() {
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
    this.log('The walls fall away. The stairs are somewhere else now.', 'dim');
  }

  private resolveLevelUp(stat: 'str' | 'agi' | 'vit'): boolean {
    const p = this.run.player;
    p[stat] += 1;
    if (stat === 'vit') p.hp += 4;
    p.hp = Math.min(p.hp, this.stats.maxHp);
    this.run.pendingLevelUps -= 1;
    this.run.pending = null;
    this.log(`${stat.toUpperCase()} rises to ${p[stat]}.`, 'good');
    this.settlePending();
    return true;
  }

  private visitGrave(g: Grave) {
    this.log(`Here lies ${g.name}, heir ${g.gen}: ${g.epitaph}.`, 'dim');
    if (g.looted || !g.item) return;
    const usable =
      (g.item.kind === 'weapon' || g.item.kind === 'armor') ? this.has('arms')
      : g.item.kind === 'food' ? this.has('hunger')
      : this.has('things');
    if (!usable) {
      this.log('Something is buried with them, but this world no longer has a rule for it.', 'dim');
      return;
    }
    if (this.run.player.inventory.length >= INVENTORY_CAP) {
      this.log('Your pack is too full to take what they left.', 'dim');
      return;
    }
    g.looted = true;
    this.run.player.inventory.push(g.item);
    this.log(`You recover their ${itemLabel(g.item, this.ctx)}.`, 'good');
  }

  // -------------------------------------------------------------------------
  // Combat
  // -------------------------------------------------------------------------

  private wear(): number {
    return alt(this.ctx, 'durability') ? 2 : 1;
  }

  private playerAttack(m: Monster) {
    const s = this.stats;
    const p = this.run.player;
    const name = this.monsterName(m);
    const sneak = !m.aware && s.sneak > 1;
    m.aware = true;
    if (s.hit < 1 && !this.rng.chance(s.hit)) {
      this.log(`You miss the ${name}.`, 'dim');
      return;
    }
    let dmg = s.attack;
    const notes: string[] = [];
    const w = p.weapon;
    if (w?.element && m.element && this.has('elements') && this.has('arms')) {
      if (w.element === m.element) {
        dmg = Math.ceil(dmg / 2);
        notes.push('it resists');
      } else {
        dmg *= 2;
        notes.push('it’s weak to that!');
      }
    }
    if (sneak) {
      dmg *= s.sneak;
      notes.push('sneak attack!');
    }
    dmg = Math.max(1, dmg - m.def);
    if (w && this.has('durability') && this.has('arms')) {
      w.dur -= this.wear();
      if (w.dur <= 0) {
        dmg *= 3;
        p.weapon = null;
        notes.push(`your ${w.name} shatters in a final blow`);
      }
    }
    m.hp -= dmg;
    this.log(`You hit the ${name} for ${dmg}${notes.length ? ` — ${notes.join(', ')}` : ''}.`, 'info');
    if (m.hp <= 0) {
      this.kill(m);
      return;
    }
    if (s.stagger > 0 && this.rng.chance(s.stagger)) {
      m.stun = Math.max(m.stun, 1);
      this.log(`The ${name} staggers.`, 'good');
    }
  }

  private monsterAttack(m: Monster) {
    const s = this.stats;
    const p = this.run.player;
    const name = this.monsterName(m);
    if (s.enemyHit < 1 && !this.rng.chance(s.enemyHit)) {
      this.log(`The ${name} misses you.`, 'dim');
      return;
    }
    const dmg = Math.max(1, m.atk - s.defense);
    const a = p.armor;
    if (a && this.has('durability') && this.has('arms')) {
      a.dur -= this.wear();
      if (a.dur <= 0) {
        p.armor = null;
        this.log(`Your ${a.name} falls apart.`, 'bad');
      }
    }
    p.hp -= dmg;
    this.count('damageTaken', dmg);
    this.log(`The ${name} hits you for ${dmg}.`, 'bad');
    if (p.hp <= 0) this.die(`slain by ${article(name)} ${name} on depth ${this.run.depth}`);
  }

  monsterName(m: Monster): string {
    const base = MONSTERS[m.kind].name;
    if (m.element && this.has('elements')) return `${m.element} ${base}`;
    return base;
  }

  private kill(m: Monster) {
    const run = this.run;
    const p = run.player;
    run.monsters = run.monsters.filter((o) => o !== m);
    p.kills += 1;
    this.log(`The ${this.monsterName(m)} dies.`, 'good');
    if (this.has('growth')) {
      p.xp += m.xp;
      while (p.xp >= xpNeeded(p.level, this.ctx)) {
        p.xp -= xpNeeded(p.level, this.ctx);
        p.level += 1;
        p.hp += 2;
        run.pendingLevelUps += 1;
        this.log(`You reach level ${p.level}!`, 'rule');
      }
    }
    const drops: Item[] = [];
    const g: GenCtx = { rng: this.rng, ctx: this.ctx, nextId: () => run.nextId++ };
    const D = B.drops;
    const bonus = this.has('bestiary') ? D.bestiaryMult : 1;
    if (this.has('things') && this.rng.chance(D.gold * bonus)) drops.push(makeItem('gold', run.depth, g));
    if (this.has('things') && this.rng.chance(D.potion * bonus)) drops.push(makeItem('potion', run.depth, g));
    if (this.has('hunger') && this.rng.chance(D.food * bonus)) drops.push(makeItem('food', run.depth, g));
    if (this.has('arms') && this.rng.chance(D.arms * bonus)) drops.push(makeItem(this.rng.chance(0.6) ? 'weapon' : 'armor', run.depth, g));
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
    this.log(`You die — ${cause}.`, 'bad');
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
          this.log('You are starving.', 'bad');
          if (p.hp <= 0) return this.die(`starved on depth ${run.depth}`);
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
    if (this.has('arcana')) {
      p.manaClock += 1;
      if (p.manaClock >= (alt(this.ctx, 'arcana') ? B.arcana.leyManaEvery : B.arcana.manaEvery)) {
        p.manaClock = 0;
        p.mana = Math.min(this.stats.maxMana, p.mana + 1);
      }
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
      this.log(`The ember stone burns you for ${burn}.`, 'bad');
      if (p.hp <= 0) return this.die(`burned on depth ${run.depth}`);
    }
    for (const m of [...run.monsters]) {
      if (f.glimmer[idx(f, m.x, m.y)] !== 'ember' || m.element === 'ember') continue;
      m.hp -= burn;
      if (this.isVisible(m.x, m.y)) this.log(`The ${this.monsterName(m)} burns.`, 'good');
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
      if (this.isVisible(m.x, m.y)) this.log(`The ${this.monsterName(m)} is caught in frost.`, 'good');
    }
    return false;
  }
}

function layoutOpts(world: World): LayoutOpts {
  return { halls: world.rules.includes('halls'), sprawl: world.rules.includes('halls') && world.variants.halls === 'alt' };
}
