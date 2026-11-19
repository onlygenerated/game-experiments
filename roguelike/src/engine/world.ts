import { EMERGENT, RULE_ORDER } from '../rules/rules.ts';
import { hashSeed, Rng } from './rng.ts';
import type { RuleId, RunState, World } from './types.ts';

export const WORLD_VERSION = 2;

/**
 * When a basic rule first shows itself: usually depth 1–2, sometimes 3–4, and
 * about one world in eight makes you wait until somewhere between 5 and 12.
 */
export function rollEmergence(rng: Rng): number {
  if (rng.chance(0.12)) return rng.int(5, 12);
  let d = 1;
  while (d < 4 && rng.chance(0.45)) d++;
  return d;
}

function rollEmergenceTable(rng: Rng): World['emergence'] {
  const e: World['emergence'] = {};
  for (const id of EMERGENT) e[id] = rollEmergence(rng);
  // Peril is the game; it never makes you wait more than a couple of floors.
  e.peril = rng.weighted([[1, 5], [2, 3], [3, 2]]);
  // The deep wakes up later than the shallows.
  e.bestiary = 2 + rollEmergence(rng);
  // The first shrine is a real choice: at least two of the rules that need
  // nothing else are available on depth 1. Pull the earliest ones forward.
  const roots: RuleId[] = ['halls', 'peril', 'things'];
  const early = roots.filter((r) => e[r] === 1).length;
  if (early < 2) {
    const late = roots.filter((r) => e[r] !== 1).sort((a, b) => e[a]! - e[b]! || roots.indexOf(a) - roots.indexOf(b));
    for (const r of late.slice(0, 2 - early)) e[r] = 1;
  }
  return e;
}

const ADJ = ['Hollow', 'Sunken', 'Ashen', 'Verdant', 'Silent', 'Gilded', 'Drowned', 'Hungry', 'Pale', 'Iron', 'Weeping', 'Crooked'];
const NOUN = ['Deep', 'Warren', 'Vault', 'Barrow', 'Maw', 'Cistern', 'Labyrinth', 'Undercroft', 'Hive', 'Spire', 'Reach', 'Well'];
const NAMES = [
  'Ada', 'Bram', 'Cass', 'Dov', 'Esme', 'Fen', 'Gil', 'Hale', 'Ines', 'Jory', 'Kit', 'Lark',
  'Mira', 'Nell', 'Orrin', 'Pell', 'Quin', 'Rook', 'Sable', 'Tamsin', 'Ulric', 'Vesna', 'Wren', 'Yara',
];

export function newWorld(seed: number): World {
  const rng = new Rng(hashSeed(seed, 'world'));
  const variants: World['variants'] = {};
  for (const id of RULE_ORDER) variants[id] = rng.chance(0.4) ? 'alt' : 'base';
  const emergence = rollEmergenceTable(new Rng(hashSeed(seed, 'emergence')));
  return {
    version: WORLD_VERSION,
    id: `w${seed.toString(36)}`,
    name: `The ${rng.pick(ADJ)} ${rng.pick(NOUN)}`,
    seed,
    created: Date.now(),
    rules: [],
    variants,
    emergence,
    generation: 0,
    history: [],
    graves: [],
    deepest: 0,
  };
}

export function heirName(world: World, gen: number): string {
  const rng = new Rng(hashSeed(world.seed, 'heir', gen));
  return rng.pick(NAMES);
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Persistence. Worlds live in one index; each world has at most one live run.
// ---------------------------------------------------------------------------

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const WORLDS_KEY = 'unfolding.worlds.v1';
const runKey = (worldId: string) => `unfolding.run.v1.${worldId}`;

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** localStorage when it works, an in-memory stand-in when it doesn't (private mode, previews). */
export function defaultKV(): KV {
  try {
    const t = '__unfolding_probe__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return memoryKV();
  }
}

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export class Store {
  kv: KV;
  constructor(kv: KV) {
    this.kv = kv;
  }

  worlds(): World[] {
    return (safeParse<World[]>(this.kv.getItem(WORLDS_KEY)) ?? []).map(migrateWorld);
  }

  world(id: string): World | null {
    return this.worlds().find((w) => w.id === id) ?? null;
  }

  saveWorld(world: World) {
    const all = this.worlds().filter((w) => w.id !== world.id);
    all.unshift(world);
    this.write(WORLDS_KEY, JSON.stringify(all));
  }

  deleteWorld(id: string) {
    this.write(WORLDS_KEY, JSON.stringify(this.worlds().filter((w) => w.id !== id)));
    this.kv.removeItem(runKey(id));
  }

  run(worldId: string): RunState | null {
    return safeParse<RunState>(this.kv.getItem(runKey(worldId)));
  }

  saveRun(run: RunState) {
    this.write(runKey(run.worldId), JSON.stringify(run));
  }

  clearRun(worldId: string) {
    this.kv.removeItem(runKey(worldId));
  }

  private write(k: string, v: string) {
    try {
      this.kv.setItem(k, v);
    } catch {
      /* quota or blocked storage: the game keeps running, it just won't persist */
    }
  }
}

/**
 * Worlds saved before Halls and Peril existed always had both — every floor had
 * many rooms and rats. Keep them playing the way they were.
 */
export function migrateWorld(w: World): World {
  if ((w.version ?? 1) >= WORLD_VERSION) return w;
  const rules: RuleId[] = [...w.rules];
  for (const r of ['peril', 'halls'] as RuleId[]) if (!rules.includes(r)) rules.unshift(r);
  return { ...w, version: WORLD_VERSION, rules, emergence: { bestiary: 4, ...(w.emergence ?? {}) } };
}
