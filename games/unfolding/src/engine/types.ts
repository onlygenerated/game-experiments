import type { HarmId } from '../rules/harm.ts';
import type { PremiseId } from '../theme/premise.ts';

export type RuleId =
  | 'halls'
  | 'peril'
  | 'things'
  | 'growth'
  | 'arms'
  | 'weight'
  | 'durability'
  | 'elements'
  | 'darkness'
  | 'hunger'
  | 'arcana'
  | 'bestiary'
  | 'commerce';

export type Element = 'ember' | 'frost';

export interface Pos {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const T_WALL = 0;
export const T_FLOOR = 1;
export const T_STAIRS = 2;
/** Stairs up: where you arrive on every floor below the first. */
export const T_UP = 3;
/** The Heart (M-55): on the deepest floor of an Age, in place of the stairs down. */
export const T_HEART = 4;

export interface Shrine {
  pos: Pos;
  /** Filled in the first time the player steps on it, from the frontier at that moment. */
  offers: RuleId[] | null;
  used: boolean;
  /** Left unanswered when its floor was left behind; it offers nothing now. */
  dark?: boolean;
  /** Commerce: it has been paid once to show other offers. */
  rerolled?: boolean;
}

/**
 * A schism shrine: it settles an axiom family the world left open, once and
 * for all. One stands on every floor until it has been answered.
 */
export interface Schism {
  pos: Pos;
  /** Which open question it settles. Absent: Means of Harm (saves from before Phase 3). */
  family?: 'harm' | 'space' | 'time';
  /** The options it offers: HarmIds, SpaceIds or TimeIds, by family. */
  offers: string[];
  used: boolean;
}

export interface Floor {
  depth: number;
  w: number;
  h: number;
  tiles: number[];
  /** Tile index → element. Dormant until Elements is adopted. */
  glimmer: Record<number, Element>;
  rooms: Rect[];
  start: Pos;
  stairs: Pos;
  shrine: Shrine | null;
  /** 1 = the player has seen this tile. Only meaningful under Darkness. */
  explored: number[];
  /** A single-room floor (no Halls yet): its one room is the largest room of the full layout. */
  solo?: boolean;
  schism?: Schism | null;
  /** Commerce: who sells on this floor, and what is left. */
  merchant?: Merchant | null;
  /** The deepest floor of this Age: its way down is the Heart. */
  heart?: boolean;
  /** Generated as a cave (Caverns), whatever the world has settled since. */
  caverns?: boolean;
  /** Drift: turns since this floor last rearranged itself, and how many times it has. */
  driftClock?: number;
  shifts?: number;
  /** Tide Clock: turns spent on this floor since the clock started, and the stage it has reached. */
  clock?: number;
  tide?: number;
}

export interface Merchant {
  pos: Pos;
  stock: Item[];
}

export type ItemKind = 'potion' | 'gold' | 'weapon' | 'armor' | 'food' | 'ammo';

/**
 * Items carry every property for every rule, active or not. Weight, element and
 * durability exist from the moment the item is generated; rules decide whether
 * anything reads them.
 */
export interface Item {
  id: number;
  kind: ItemKind;
  /** Genotype key ('potion', 'gold', 'food:1', 'weapon:4', 'armor:0'): names resolve from it per lexicon. */
  key?: string;
  /** The name it was generated with; used when there is no key (older saves). */
  name: string;
  atk?: number;
  def?: number;
  heal?: number;
  amount?: number;
  nourish?: number;
  weight: number;
  element: Element | null;
  dur: number;
  maxDur: number;
}

export interface FloorItem {
  item: Item;
  x: number;
  y: number;
}

export type MonsterKind = 'rat' | 'bat' | 'goblin' | 'slime';

export interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  xp: number;
  aware: boolean;
  stun: number;
  /** Latent: only matters once Elements is adopted. */
  element: Element | null;
  /** The turn you last harmed it (Discourse: composure returns to the unaddressed). */
  heard?: number;
}

export interface Player {
  name: string;
  x: number;
  y: number;
  hp: number;
  /** Latent stats: they exist at 3 from the start, Growth makes them matter. */
  str: number;
  agi: number;
  vit: number;
  level: number;
  xp: number;
  inventory: Item[];
  weapon: Item | null;
  armor: Item | null;
  gold: number;
  satiety: number;
  mana: number;
  kills: number;
  regenClock: number;
  manaClock: number;
  starveClock: number;
  /** Shots carried (Volley). Absent until a world's means needs them. */
  ammo?: number;
}

export interface Grave {
  gen: number;
  depth: number;
  x: number;
  y: number;
  name: string;
  epitaph: string;
  item: Item | null;
  looted: boolean;
}

export interface Chronicle {
  gen: number;
  name: string;
  depth: number;
  level: number;
  turns: number;
  cause: string;
  rules: RuleId[];
  /** Reached the Heart: this heir ended an Age. */
  won?: boolean;
  /** The Age this heir lived in (absent: the first). */
  age?: number;
}

/** An Age that ended: someone reached the Heart. */
export interface AgeRecord {
  age: number;
  gen: number;
  name: string;
  depth: number;
  turns: number;
  level: number;
  rules: RuleId[];
}

/** Shape of Space (M-20): rooms and corridors, or open caves. */
export type SpaceId = 'rooms' | 'caverns' | 'drift';
/** Flow of Time (M-24): plain turns, or a clock on every floor. */
export type TimeId = 'turns' | 'tide';

/** The questions axioms answer; each world settles one option per family (ROADMAP.md §1.4). */
export type AxiomFamily = 'harm' | 'space' | 'time' | 'self' | 'knowledge';

/** A world's identity, rolled once from its seed (ROADMAP.md §1.5). */
export interface Genome {
  premise: PremiseId;
  /** Bundles of roles borrowed from another premise. */
  intrusions: { bundle: 'restorative' | 'foes' | 'arms' | 'currency' | 'sustenance'; from: PremiseId }[];
  /**
   * Axiom options settled so far. A family left out is open: a schism shrine
   * will settle it. Means of Harm is rolled or open; the rest are fixed for now.
   */
  axioms: Partial<Record<AxiomFamily, string>> & { harm?: HarmId; space?: SpaceId; time?: TimeId };
  /** The rules this world can ever discover; null means every rule. */
  pool: RuleId[] | null;
}

export interface World {
  /** Save format. 1 = before Halls/Peril existed; 2 = before genomes. */
  version?: number;
  id: string;
  name: string;
  seed: number;
  created: number;
  /** Adopted rules, in the order they entered the world. */
  rules: RuleId[];
  /** Rolled once at world creation; applies whenever the rule is active. */
  variants: Partial<Record<RuleId, 'base' | 'alt'>>;
  /**
   * The depth at which each rule first shows itself in this world (at shrines,
   * or by imposing itself). Rolled once; mostly early, occasionally very late.
   * Missing entries mean depth 1.
   */
  emergence: Partial<Record<RuleId, number>>;
  genome: Genome;
  generation: number;
  history: Chronicle[];
  graves: Grave[];
  deepest: number;
  /** The Age this world is in: 1 until someone reaches the Heart. */
  age?: number;
  /** The depth of this Age's Heart (M-55). */
  heart?: number;
  /** Ages that have ended, oldest first. */
  ages?: AgeRecord[];
}

export type Tone = 'info' | 'good' | 'bad' | 'rule' | 'dim';

export interface LogLine {
  text: string;
  tone: Tone;
  turn: number;
}

/** A floor you've left, kept as it was so you can come back to it. */
export interface StoredFloor {
  floor: Floor;
  monsters: Monster[];
  items: FloorItem[];
  /** The world's rules when you left, so rules adopted since can catch the floor up. */
  rules: RuleId[];
}

export type Pending =
  | { kind: 'shrine' }
  | { kind: 'levelup' }
  | { kind: 'schism' }
  | { kind: 'shop' }
  | null;

export interface RunState {
  worldId: string;
  gen: number;
  turn: number;
  depth: number;
  floor: Floor;
  monsters: Monster[];
  items: FloorItem[];
  player: Player;
  rng: number;
  nextId: number;
  log: LogLine[];
  pending: Pending;
  pendingLevelUps: number;
  over: boolean;
  cause: string | null;
  /** The run ended at the Heart, not in a grave. */
  won?: boolean;
  /** Floors you've left this run, by depth. Absent in runs saved before stairs up existed. */
  visited?: Record<number, StoredFloor>;
}
