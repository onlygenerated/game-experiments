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
  | 'bestiary';

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

export interface Shrine {
  pos: Pos;
  /** Filled in the first time the player steps on it, from the frontier at that moment. */
  offers: RuleId[] | null;
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
}

export type ItemKind = 'potion' | 'gold' | 'weapon' | 'armor' | 'food';

/**
 * Items carry every property for every rule, active or not. Weight, element and
 * durability exist from the moment the item is generated; rules decide whether
 * anything reads them.
 */
export interface Item {
  id: number;
  kind: ItemKind;
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
}

export interface World {
  /** Save format. 1 = before Halls/Peril existed (both were implicitly always on). */
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
  generation: number;
  history: Chronicle[];
  graves: Grave[];
  deepest: number;
}

export type Tone = 'info' | 'good' | 'bad' | 'rule' | 'dim';

export interface LogLine {
  text: string;
  tone: Tone;
  turn: number;
}

export type Pending =
  | { kind: 'shrine' }
  | { kind: 'levelup' }
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
}
