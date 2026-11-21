/**
 * Item 20: seeded room generation. Same three ingredients item 4/5/8 already
 * hand-author — shape, exits, tiles — produced deterministically from a seed
 * instead of typed by hand. `ROOM_SHAPES`/`ARCHETYPE_ROOMS` (`shapes.ts`) stay
 * exactly as they are: hand-authored rooms are kept as fixtures precisely so
 * a test failure points at a real regression, never at "today's random room
 * happened to roll a shape nobody checked" — this file is purely additive, a
 * new room *source*, not a replacement for the existing ones.
 *
 * The shape comes from a flood-growth walk: start at the origin, repeatedly
 * pop a uniformly random cell off a frontier of not-yet-claimed neighbours of
 * claimed cells, and claim it. Every claimed cell is adjacent to an
 * already-claimed cell by construction, so the result is connected with no
 * extra check needed — the same guarantee `HOURGLASS_ROOM`'s hand author had
 * to hold in their head, produced by the algorithm instead.
 *
 * Exits are two border cells of that shape, chosen to sit far apart (the
 * largest pairwise hex-distance found within a shuffled sample of the
 * border) rather than adjacent doorways that would make "reach an exit"
 * trivial — the same "opposite doorways" property `ROUND_ROOM`/
 * `HOURGLASS_ROOM` were each hand-picked to have.
 *
 * Tiles are scattered at a target density (`options.tileDensity`) across
 * non-exit cells, weighted toward the scoring-only kinds
 * (`cardMultiplier`/`lineMultiplier`/`trap`) over the two kinds that remove a
 * cell from play (`blocked`/`artifact`) — and a `blocked`/`artifact`
 * assignment is only kept if the room's placeable cells (every cell minus
 * every `blocked`/`artifact` one) stay a single connected region afterward,
 * so generation can never seal off part of the room from every exit. No such
 * guard exists for the hand-authored rooms because a human already checked
 * each one by eye; this file has to check it for every seed, since nobody
 * will.
 *
 * Threshold and counters are deliberately not tuned here — same status as
 * every hand-authored room's own placeholder (see `shapes.ts`, `room.ts`):
 * item 22 is where a real number gets set, from a probed median, once the
 * probe can play a room at all (item 13b-13d) and rooms exist to probe (this
 * item). `threshold` is a plain, round, size-scaled formula — not a guess
 * refined by watching a room played, which is exactly what "never tune by
 * eye" forbids — and `counters` is left unset (the run's own `Config`
 * applies), since this item's own text names only "shapes, tiles and exits".
 */
import { hashSeed, mulberry32, RANKS, shuffle, SUITS, type Card } from '../deck';
import { hexDistance, hexKey, hexNeighbors, ORIGIN, type Hex } from '../hex/coords';
import { makeRoom, roomBorder, type Room } from './room';
import type { Tile } from './tile';

export interface GenerateRoomOptions {
  name?: string;
  /** Cell count is drawn uniformly from [minSize, maxSize]. */
  minSize?: number;
  maxSize?: number;
  /** Target fraction of non-exit cells carrying a tile, in [0, 1]. */
  tileDensity?: number;
}

const DEFAULT_MIN_SIZE = 7;
const DEFAULT_MAX_SIZE = 19;
const DEFAULT_TILE_DENSITY = 0.25;

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Connected flood growth from the origin — every claimed cell is adjacent to
 * an already-claimed one by construction, so the result needs no separate
 * connectivity check. */
function growShape(rng: () => number, targetSize: number): Hex[] {
  const claimed = new Map<string, Hex>();
  claimed.set(hexKey(ORIGIN), ORIGIN);
  const frontier: Hex[] = hexNeighbors(ORIGIN);

  while (claimed.size < targetSize && frontier.length > 0) {
    const i = Math.floor(rng() * frontier.length);
    const next = frontier[i];
    frontier.splice(i, 1);
    const k = hexKey(next);
    if (claimed.has(k)) continue;
    claimed.set(k, next);
    for (const n of hexNeighbors(next)) {
      if (!claimed.has(hexKey(n))) frontier.push(n);
    }
  }

  return [...claimed.values()];
}

/** Two border cells picked far apart rather than any two — a shuffled sample
 * so the pick is seed-dependent, then the sample member farthest from the
 * first pick. Falls back to whatever border exists (0 or 1 cells) for a
 * pathologically small room rather than throwing. */
function pickExits(rng: () => number, border: readonly Hex[]): Hex[] {
  if (border.length <= 2) return [...border];
  const sample = shuffle(border, rng);
  const a = sample[0];
  let b = sample[1];
  let bestDist = hexDistance(a, b);
  for (const cand of sample.slice(2)) {
    const d = hexDistance(a, cand);
    if (d > bestDist) {
      b = cand;
      bestDist = d;
    }
  }
  return [a, b];
}

type RealTileKind = Exclude<Tile['kind'], 'marker'>;
/** Weighted toward the scoring-only kinds — a room stuffed with `blocked`
 * cells is a worse room, not a harder one, and `marker` (item 8's substrate
 * placeholder, no effect) has nothing to do with a real generated room. */
const TILE_WEIGHTS: readonly [RealTileKind, number][] = [
  ['cardMultiplier', 3],
  ['lineMultiplier', 3],
  ['trap', 2],
  ['blocked', 1],
  ['artifact', 1],
];
const TOTAL_TILE_WEIGHT = TILE_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

function pickTileKind(rng: () => number): RealTileKind {
  let roll = rng() * TOTAL_TILE_WEIGHT;
  for (const [kind, weight] of TILE_WEIGHTS) {
    if (roll < weight) return kind;
    roll -= weight;
  }
  return TILE_WEIGHTS[TILE_WEIGHTS.length - 1][0];
}

function randomArtifactCard(rng: () => number, seed: string, index: number): Card {
  const rank = RANKS[Math.floor(rng() * RANKS.length)];
  const suit = SUITS[Math.floor(rng() * SUITS.length)];
  // Prefixed and seed/index-qualified so a generated artifact's id never
  // collides with freshDeck's own cards or another generated one, the same
  // reasoning shapes.ts's hand-authored `artifact-AS` id used.
  return { id: `gen-artifact-${seed}-${index}`, rank, suit };
}

/** True if every cell in `cells` other than those in `unplaceable` still
 * forms one connected region — the invariant a generated `blocked`/
 * `artifact` assignment must not break, so a room can never seal off part of
 * itself from every exit. */
function placeableCellsStayConnected(cells: readonly Hex[], unplaceable: ReadonlySet<string>): boolean {
  const placeable = cells.filter((h) => !unplaceable.has(hexKey(h)));
  if (placeable.length === 0) return true;

  const placeableSet = new Set(placeable.map(hexKey));
  const seen = new Set<string>([hexKey(placeable[0])]);
  const stack = [placeable[0]];
  while (stack.length) {
    const h = stack.pop()!;
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      if (placeableSet.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return seen.size === placeable.length;
}

/** Scatter tiles across `cells` (excluding `exits`), skipping any
 * `blocked`/`artifact` roll that would disconnect the placeable cells —
 * downgraded to no tile at all on that cell rather than retried, since a
 * retry loop over the same rng stream would make every later draw depend on
 * how many rejections happened earlier, which is a subtler kind of
 * non-reproducibility than simply "this one cell rolled nothing". */
function scatterTiles(
  rng: () => number,
  seed: string,
  cells: readonly Hex[],
  exits: readonly Hex[],
  density: number,
): (readonly [Hex, Tile])[] {
  const exitKeys = new Set(exits.map(hexKey));
  const candidates = shuffle(
    cells.filter((h) => !exitKeys.has(hexKey(h))),
    rng,
  );
  const budget = Math.round(candidates.length * density);

  const entries: (readonly [Hex, Tile])[] = [];
  const unplaceable = new Set<string>();
  let artifactIndex = 0;

  for (const h of candidates.slice(0, budget)) {
    const kind = pickTileKind(rng);
    if (kind === 'blocked' || kind === 'artifact') {
      const trial = new Set(unplaceable);
      trial.add(hexKey(h));
      if (!placeableCellsStayConnected(cells, trial)) continue;
      unplaceable.add(hexKey(h));
    }
    const tile: Tile =
      kind === 'blocked'
        ? { kind: 'blocked' }
        : kind === 'trap'
          ? { kind: 'trap' }
          : kind === 'artifact'
            ? { kind: 'artifact', card: randomArtifactCard(rng, seed, artifactIndex++) }
            : { kind, multiplier: 2 };
    entries.push([h, tile]);
  }

  return entries;
}

/**
 * A fresh room from `seed` — same seed, same room, always (`mulberry32` is a
 * pure function of its numeric seed, and `hashSeed` a pure fold of the
 * string, exactly the pair `shuffledDeck` already relies on for the same
 * guarantee). `options` narrows the range generation draws from; every field
 * is optional; item 22 finds real numbers for threshold, this file just
 * needs *a* number so a generated room is playable today.
 */
export function generateRoom(seed: string, options: GenerateRoomOptions = {}): Room {
  const rng = mulberry32(hashSeed(seed));
  const minSize = options.minSize ?? DEFAULT_MIN_SIZE;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const density = options.tileDensity ?? DEFAULT_TILE_DENSITY;
  const name = options.name ?? `Generated (${seed})`;

  const size = randomInt(rng, minSize, maxSize);
  const cells = growShape(rng, size);
  const shapeOnly = makeRoom(name, cells);
  const exits = pickExits(rng, roomBorder(shapeOnly));

  const tiles = scatterTiles(rng, seed, cells, exits, density);
  // A plain, round, size-scaled placeholder — not a measurement. See the
  // file header and ROOMS.md's standing "never tune a room by eye" rule.
  const threshold = Math.round((cells.length * 3) / 10) * 10;

  return makeRoom(name, cells, exits, threshold, tiles);
}
