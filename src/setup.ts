import { CONFIG, type Config, type HandName } from './config';
import { LENSES } from './lens';
import { RULESETS, type Ruleset } from './rulesets';

/**
 * The parameter space, as data.
 *
 * Every shipped ruleset is already a `Config`, so the setup screen is not a
 * second way of defining a game — it is the same way, with a UI on it. What
 * this file adds is the part that was previously only in people's heads: which
 * parameters actually *do* anything given the others. A cap on line length
 * means nothing on a hex board, cribbage rates mean nothing under the poker
 * lens, and a discard size above the hand size is unreachable. Rather than
 * letting the form offer settings that quietly do nothing, each field declares
 * when it applies, and `normalise` repairs the combinations that cannot be
 * expressed as a hidden field.
 */

export type Field =
  | { path: string; label: string; help?: string; kind: 'bool'; applies?: (c: Config) => boolean }
  | {
      path: string;
      label: string;
      help?: string;
      kind: 'number';
      min: number;
      max: number;
      step?: number;
      applies?: (c: Config) => boolean;
    }
  | {
      path: string;
      label: string;
      help?: string;
      kind: 'enum';
      options: { value: string; label: string }[];
      applies?: (c: Config) => boolean;
    };

export interface FieldGroup {
  title: string;
  note?: string;
  fields: Field[];
}

const isGrid = (c: Config) => c.structure === 'grid';
const isHex = (c: Config) => c.structure === 'hex';

export const GROUPS: FieldGroup[] = [
  {
    title: 'Board',
    fields: [
      {
        path: 'structure',
        label: 'Shape',
        kind: 'enum',
        options: [
          { value: 'grid', label: 'Square grid' },
          { value: 'hex', label: 'Hex sprawl' },
        ],
        help: 'A grid has two line directions and a length cap. A hex has three and no cap — only your best window along each line scores.',
      },
      { path: 'gridSize', label: 'Grid size', kind: 'number', min: 3, max: 9, applies: isGrid },
      {
        path: 'lineCap',
        label: 'Line cap',
        kind: 'number',
        min: 2,
        max: 9,
        applies: isGrid,
        help: 'A run this long is full and can never be extended.',
      },
      { path: 'hexRadius', label: 'Rings', kind: 'number', min: 2, max: 6, applies: isHex },
      {
        path: 'hexWindow',
        label: 'Scoring window',
        kind: 'number',
        min: 2,
        max: 8,
        applies: isHex,
        help: 'Hex lines are uncapped, so only the best stretch this long scores.',
      },
      {
        path: 'hexRingBonus',
        label: 'Distance bonus per ring',
        kind: 'number',
        min: 0,
        max: 0.5,
        step: 0.05,
        applies: isHex,
        help: 'Score × (1 + ring × this). Zero turns it off.',
      },
      {
        path: 'startWithAnchor',
        label: 'Deal a starting card',
        kind: 'bool',
        help: 'Off means the board starts empty and your first placement picks the origin.',
      },
      {
        path: 'mechanics.requireAdjacency',
        label: 'Cards must touch',
        kind: 'bool',
        help: 'Off is free placement: any empty cell is legal.',
      },
    ],
  },
  {
    title: 'Scoring',
    fields: [
      {
        path: 'lensId',
        label: 'How a line counts',
        kind: 'enum',
        options: LENSES.map((l) => ({ value: l.id, label: l.name })),
        help: 'The single biggest lever measured. Poker scores one best hand per line; cribbage counts fifteens, pairs, runs and flushes additively.',
      },
      {
        path: 'cribbage.chipsPerPoint',
        label: 'Chips per point',
        kind: 'number',
        min: 1,
        max: 20,
        applies: (c) => c.lensId === 'cribbage',
      },
      {
        path: 'cribbage.baseChipsPerCard',
        label: 'Flat chips per card',
        kind: 'number',
        min: 0,
        max: 10,
        applies: (c) => c.lensId === 'cribbage',
        help: 'Zero means a line that counts nothing scores nothing, so a placement can be wasted.',
      },
      {
        path: 'cribbage.multPerPoint',
        label: 'Points per +1 mult',
        kind: 'number',
        min: 1,
        max: 10,
        applies: (c) => c.lensId === 'cribbage',
      },
      {
        path: 'cribbage.flushMin',
        label: 'Shortest flush',
        kind: 'number',
        min: 2,
        max: 7,
        applies: (c) => c.lensId === 'cribbage',
      },
      {
        path: 'partialHands.enabled',
        label: 'Partial straights and flushes count',
        kind: 'bool',
        applies: (c) => c.lensId === 'poker',
        help: 'The PRD open question. Lets a short straight or flush score at a reduced rate.',
      },
      {
        path: 'partialHands.scaleByLength.3',
        label: '3-card rate',
        kind: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        applies: (c) => c.lensId === 'poker' && c.partialHands.enabled,
      },
      {
        path: 'partialHands.scaleByLength.4',
        label: '4-card rate',
        kind: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        applies: (c) => c.lensId === 'poker' && c.partialHands.enabled,
      },
    ],
  },
  {
    title: 'Mechanics',
    note: 'Grid only. A hex board has three line directions and no length cap, so "the two axes" and "a full line" have nothing to refer to.',
    fields: [
      {
        path: 'mechanics.axisMode',
        label: 'Axis roles',
        kind: 'enum',
        applies: isGrid,
        options: [
          { value: 'split', label: 'Row → chips, column → mult' },
          { value: 'both', label: 'Every line feeds both' },
          { value: 'suit', label: 'Suit decides which' },
        ],
      },
      {
        path: 'mechanics.payOnCompleteOnly',
        label: 'Deferred payout',
        kind: 'bool',
        applies: (c) => isGrid(c) && !c.mechanics.lockAndCash,
        help: 'A placement banks nothing unless it fills a row or column.',
      },
      {
        path: 'mechanics.lockAndCash',
        label: 'Lock and cash',
        kind: 'bool',
        applies: isGrid,
        help: 'Placing banks nothing; you cash a cross to bank it, which seals both its lines and costs an action.',
      },
    ],
  },
  {
    title: 'The run',
    fields: [
      { path: 'placementsPerRun', label: 'Placements', kind: 'number', min: 3, max: 40 },
      {
        path: 'handSize',
        label: 'Hand size',
        kind: 'number',
        min: 1,
        max: 10,
        help: 'One card is the draft mode: no hand, place it or burn it.',
      },
      { path: 'discardsPerRun', label: 'Discards', kind: 'number', min: 0, max: 12 },
      {
        path: 'maxDiscardSelection',
        label: 'Cards per discard',
        kind: 'number',
        min: 1,
        max: 10,
        applies: (c) => c.handSize > 1,
      },
      {
        path: 'targetScore',
        label: 'Target score',
        kind: 'number',
        min: 10,
        max: 10000,
        step: 5,
        help: 'Presets have this calibrated from a measured probe. A hand-picked one is a guess, so winning or losing says little.',
      },
    ],
  },
];

// --- path access ------------------------------------------------------------

export function getPath(cfg: Config, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], cfg);
}

/** Immutably set a dotted path, cloning only the objects along the way. */
export function setPath(cfg: Config, path: string, value: unknown): Config {
  const keys = path.split('.');
  const clone = (node: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const obj = node as Record<string, unknown>;
    return { ...obj, [keys[i]]: clone(obj?.[keys[i]], i + 1) };
  };
  return clone(cfg, 0) as Config;
}

/**
 * Repair the combinations a hidden field cannot express.
 *
 * These are not preferences — each one is a setting that would otherwise be
 * unreachable, contradictory, or silently ignored by the engine.
 */
export function normalise(cfg: Config): Config {
  const out: Config = {
    ...cfg,
    mechanics: { ...cfg.mechanics },
    cribbage: { ...cfg.cribbage },
    partialHands: { ...cfg.partialHands },
  };

  // A run longer than the board can hold is unwinnable by construction.
  const cells = out.structure === 'grid' ? out.gridSize * out.gridSize : Infinity;
  out.placementsPerRun = Math.min(out.placementsPerRun, cells);

  // A cap longer than the board is not a cap.
  if (out.structure === 'grid') out.lineCap = Math.min(out.lineCap, out.gridSize);

  // You cannot discard more cards than you hold.
  out.maxDiscardSelection = Math.max(1, Math.min(out.maxDiscardSelection, out.handSize));
  out.minDiscardSelection = Math.min(out.minDiscardSelection, out.maxDiscardSelection);

  // Both gate the payout, and the engine checks lock-and-cash first. Making
  // the precedence explicit beats leaving a setting on screen that does
  // nothing because another setting outranks it.
  if (out.mechanics.lockAndCash) out.mechanics.payOnCompleteOnly = false;

  return out;
}

/** Fields worth showing: the ones that can actually affect this config's play. */
export function visibleFields(group: FieldGroup, cfg: Config): Field[] {
  return group.fields.filter((f) => !f.applies || f.applies(cfg));
}

// --- preset matching --------------------------------------------------------

/** Stable stringify, so key order from object spreads cannot affect equality. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

export function sameConfig(a: Config, b: Config): boolean {
  return canonical(a) === canonical(b);
}

/**
 * The preset this config *is*, if any. Worth knowing because presets carry
 * probe-calibrated targets and measured metrics, and a custom config carries
 * neither.
 */
export function matchingPreset(cfg: Config): Ruleset | undefined {
  // Compared after normalising both sides, because a few presets carry a
  // `maxDiscardSelection` larger than their hand — unreachable, so it cannot
  // affect play, but it would otherwise make the preset fail to match itself.
  const want = canonical(normalise(cfg));
  return RULESETS.find((r) => canonical(normalise(r.config)) === want);
}

// --- the poker tables -------------------------------------------------------
//
// Exposed so that every shipped ruleset really is reproducible from this
// screen: `poker-mult-amped` and `poker-flat-ranks` differ from the baseline in
// nothing but these numbers.

export const HAND_NAMES = Object.keys(CONFIG.hands) as HandName[];
export const RANKS_IN_ORDER = Object.keys(CONFIG.rankChips)
  .map(Number)
  .sort((a, b) => a - b);
