import type { AutoPickup } from '../engine/game.ts';
import type { KV } from '../engine/world.ts';

/** Per-viewer play preferences. Kept in browser storage; never part of a world or run. */
export interface Options {
  autoPickup: AutoPickup;
  /** Ask before taking the stairs past a shrine you haven't answered. */
  confirmShrine: boolean;
  /** Mouse only: describe whatever tile is under the pointer. */
  hoverInspect: boolean;
  travelSpeed: 'slow' | 'normal' | 'fast';
  holdDelay: 'short' | 'normal' | 'long';
  tileSize: 'small' | 'normal' | 'large';
  dpad: 'auto' | 'always' | 'never';
  vibrate: boolean;
  reduceMotion: boolean;
  /** Call everything by its mechanical name (HP, common foe, healing item) instead of the world's own words. */
  plainLabels: boolean;
  /** Testing mode: every new floor puts the shrine, the stairs, sample items and one of every foe and hazard close by. */
  testing: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  autoPickup: 'all',
  confirmShrine: true,
  hoverInspect: true,
  travelSpeed: 'normal',
  holdDelay: 'normal',
  tileSize: 'normal',
  dpad: 'auto',
  vibrate: true,
  reduceMotion: false,
  plainLabels: false,
  testing: false,
};

export const TRAVEL_STEP_MS = { slow: 140, normal: 70, fast: 25 } as const;
export const HOLD_MS = { short: 250, normal: 380, long: 600 } as const;
/** Smallest and largest map tile, in CSS pixels. */
export const TILE_PX = { small: [12, 24], normal: [16, 32], large: [22, 44] } as const;

type Choice = { value: string; label: string };
export interface OptionDef {
  key: keyof Options;
  group: 'Gameplay' | 'Controls' | 'Display' | 'Testing';
  label: string;
  help: string;
  choices: Choice[];
}

const onOff: Choice[] = [
  { value: 'true', label: 'On' },
  { value: 'false', label: 'Off' },
];

export const OPTION_DEFS: OptionDef[] = [
  {
    key: 'autoPickup',
    group: 'Gameplay',
    label: 'Auto pickup',
    help: 'What happens when you step onto items. Otherwise press g, or use the Here panel.',
    choices: [
      { value: 'all', label: 'Everything' },
      { value: 'gold', label: 'Currency only' },
      { value: 'none', label: 'Off' },
    ],
  },
  {
    key: 'confirmShrine',
    group: 'Gameplay',
    label: 'Warn before leaving a shrine behind',
    help: 'A shrine is lost once you take the stairs.',
    choices: onOff,
  },
  {
    key: 'travelSpeed',
    group: 'Controls',
    label: 'Walk speed',
    help: 'How fast press-and-hold travel steps.',
    choices: [
      { value: 'slow', label: 'Slow' },
      { value: 'normal', label: 'Normal' },
      { value: 'fast', label: 'Fast' },
    ],
  },
  {
    key: 'holdDelay',
    group: 'Controls',
    label: 'Hold to walk after',
    help: 'How long to press a spot before you set off toward it.',
    choices: [
      { value: 'short', label: '0.25 s' },
      { value: 'normal', label: '0.4 s' },
      { value: 'long', label: '0.6 s' },
    ],
  },
  {
    key: 'hoverInspect',
    group: 'Controls',
    label: 'Describe tiles on hover',
    help: 'With a mouse, show what’s under the pointer without entering Look mode.',
    choices: onOff,
  },
  {
    key: 'dpad',
    group: 'Controls',
    label: 'On-screen controls',
    help: 'Auto shows them on touch screens and narrow windows.',
    choices: [
      { value: 'auto', label: 'Auto' },
      { value: 'always', label: 'Always' },
      { value: 'never', label: 'Never' },
    ],
  },
  {
    key: 'vibrate',
    group: 'Controls',
    label: 'Vibrate when a walk starts',
    help: 'Only on devices and browsers that allow it.',
    choices: onOff,
  },
  {
    key: 'tileSize',
    group: 'Display',
    label: 'Map tile size',
    help: 'Larger tiles are easier to tap; smaller ones show more of the floor.',
    choices: [
      { value: 'small', label: 'Small' },
      { value: 'normal', label: 'Normal' },
      { value: 'large', label: 'Large' },
    ],
  },
  {
    key: 'reduceMotion',
    group: 'Display',
    label: 'Reduce motion',
    help: 'Turns off hit flashes and panel animations.',
    choices: onOff,
  },
  {
    key: 'plainLabels',
    group: 'Display',
    label: 'Plain labels',
    help: 'Every world speaks its own language. This calls things what they do instead: HP, common foe, healing item.',
    choices: onOff,
  },
  {
    key: 'testing',
    group: 'Testing',
    label: 'Testing mode',
    help: 'For trying combinations of rules quickly. Every new floor starts you within 3 tiles of its shrine and its stairs down, with sample items within 10 tiles and one of every foe and hazard within 30. Applies from the next new floor.',
    choices: onOff,
  },
];

const KEY = 'unfolding.options.v1';

/** Read options, keeping only known keys with allowed values. */
export function loadOptions(kv: KV): Options {
  const out: Options = { ...DEFAULT_OPTIONS };
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(kv.getItem(KEY) ?? '{}') ?? {};
  } catch {
    raw = {};
  }
  for (const def of OPTION_DEFS) {
    const v = raw[def.key];
    if (v === undefined || !def.choices.some((c) => c.value === String(v))) continue;
    (out as unknown as Record<string, unknown>)[def.key] = typeof DEFAULT_OPTIONS[def.key] === 'boolean' ? v === true || v === 'true' : v;
  }
  return out;
}

export function saveOptions(kv: KV, o: Options) {
  try {
    kv.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage blocked: options last for this visit only */
  }
}

/** Parse a choice value from the form back into the option's type. */
export function parseOption<K extends keyof Options>(key: K, value: string): Options[K] {
  return (typeof DEFAULT_OPTIONS[key] === 'boolean' ? value === 'true' : value) as Options[K];
}
