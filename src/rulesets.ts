import { CONFIG, type Config } from './config';

export interface Ruleset {
  id: string;
  name: string;
  /** Menu grouping. */
  group: string;
  blurb: string;
  config: Config;
}

const base = (over: Partial<Config>): Config => ({ ...CONFIG, ...over });

const cribbageBase = (over: Partial<Config> = {}): Config =>
  base({ lensId: 'cribbage', targetScore: 600, ...over });

/**
 * Every variant is a Config. Swapping the lens, the board, or the numbers all
 * happen here, so a variant is data rather than a fork of the codebase.
 */
export const RULESETS: Ruleset[] = [
  {
    id: 'poker-baseline',
    name: 'Poker — baseline',
    group: 'Control',
    blurb: 'The original rules, unchanged. The reference every variant is measured against.',
    config: CONFIG,
  },
  {
    id: 'poker-tight',
    name: 'Poker — tight target',
    group: 'Poker tuning',
    blurb: 'Raised target. Tests whether the flat skill curve was just a soft bar.',
    config: base({ targetScore: 540 }),
  },
  {
    id: 'poker-mult-amped',
    name: 'Poker — mult amplified',
    group: 'Poker tuning',
    blurb: 'Same hands, steeper mult column. Is the mult axis dead because it is rare, or weak?',
    config: base({
      hands: {
        ...CONFIG.hands,
        Pair: { minCards: 2, chips: 10, mult: 3 },
        'Two Pair': { minCards: 4, chips: 20, mult: 4 },
        'Three of a Kind': { minCards: 3, chips: 30, mult: 6 },
        Straight: { minCards: 5, chips: 30, mult: 8 },
        Flush: { minCards: 5, chips: 35, mult: 8 },
        'Full House': { minCards: 5, chips: 40, mult: 9 },
        'Four of a Kind': { minCards: 4, chips: 60, mult: 12 },
        'Straight Flush': { minCards: 5, chips: 100, mult: 16 },
      },
      targetScore: 620,
    }),
  },
  {
    id: 'poker-partials',
    name: 'Poker — partials on',
    group: 'Poker tuning',
    blurb: '3- and 4-card straights and flushes count at a reduced rate. The PRD open question.',
    config: base({ partialHands: { ...CONFIG.partialHands, enabled: true } }),
  },

  {
    id: 'poker-short-run',
    name: 'Poker — short run',
    group: 'Poker tuning',
    blurb: 'Ten placements instead of fifteen. Scarcity of turns rather than a higher bar.',
    config: base({ placementsPerRun: 10, targetScore: 370 }),
  },
  {
    id: 'poker-partials-generous',
    name: 'Poker — generous partials',
    group: 'Poker tuning',
    blurb: 'Partial straights and flushes at 0.75 / 0.9 instead of 0.5 / 0.75.',
    config: base({
      partialHands: { enabled: true, minCards: 3, scaleByLength: { 3: 0.75, 4: 0.9 } },
      targetScore: 700,
    }),
  },
  {
    id: 'poker-flat-ranks',
    name: 'Poker — flat rank chips',
    group: 'Poker tuning',
    blurb:
      'Every rank worth 5. Kills the play-high-cards gradient so hand formation is the only chip source.',
    config: base({
      rankChips: Object.fromEntries([...Array(13)].map((_, i) => [i + 2, 5])),
      targetScore: 435,
    }),
  },
  {
    id: 'poker-short-lines',
    name: 'Poker — short lines (cap 4)',
    group: 'Poker tuning',
    blurb: 'Tighter cap. Does it create useful scarcity, or choke the board too early?',
    config: base({ lineCap: 4, targetScore: 520 }),
  },
  {
    id: 'poker-long-lines',
    name: 'Poker — long lines (cap 6)',
    group: 'Poker tuning',
    blurb: 'Looser cap. Do longer lines make straights and flushes common enough to matter?',
    config: base({ lineCap: 6, targetScore: 660 }),
  },
  {
    id: 'poker-lean-hand',
    name: 'Poker — lean hand',
    group: 'Poker tuning',
    blurb: 'Hand of 4, five discards. Is the flatness because 7 cards always contain a good option?',
    config: base({ handSize: 4, discardsPerRun: 5, targetScore: 545 }),
  },
  {
    id: 'poker-small-board',
    name: 'Poker — small board (5x5)',
    group: 'Poker tuning',
    blurb: 'Crowded grid, 12 placements. Does spatial pressure make position matter?',
    config: base({ gridSize: 5, placementsPerRun: 12, targetScore: 440 }),
  },

  {
    id: 'cribbage-blank',
    name: 'Cribbage — blank board',
    group: 'Cribbage',
    blurb:
      'No centre card. Your first placement picks the origin, so where the structure starts is a decision.',
    config: cribbageBase({ startWithAnchor: false, targetScore: 550 }),
  },
  {
    id: 'poker-blank',
    name: 'Poker — blank board',
    group: 'Poker tuning',
    blurb: 'No centre card, poker scoring. The same origin question against the control lens.',
    config: base({ startWithAnchor: false, targetScore: 570 }),
  },

  {
    id: 'cribbage',
    name: 'Cribbage',
    group: 'Cribbage',
    blurb:
      'Fifteens, pairs, runs and flushes. Additive scoring, so even a two-card line counts and mult rises smoothly.',
    config: cribbageBase(),
  },
  {
    id: 'cribbage-unbound',
    name: 'Cribbage — unbound lines',
    group: 'Cribbage',
    blurb:
      'Line cap raised to 7. Cribbage counts grow faster than length, so this is where building bigger should really pay.',
    config: cribbageBase({ lineCap: 7, targetScore: 1050 }),
  },
  {
    id: 'cribbage-pure',
    name: 'Cribbage — pure count',
    group: 'Cribbage',
    blurb: 'No flat per-card chips. A line with no count scores nothing, so dead placements are real.',
    config: cribbageBase({
      cribbage: { ...CONFIG.cribbage, baseChipsPerCard: 0 },
      targetScore: 450,
    }),
  },
  {
    id: 'cribbage-lean',
    name: 'Cribbage — lean hand',
    group: 'Cribbage',
    blurb: 'Hand of 4, five discards. Fewer options per turn, so each placement is a real constraint.',
    config: cribbageBase({ handSize: 4, discardsPerRun: 5, targetScore: 500 }),
  },
  {
    id: 'cribbage-flush3',
    name: 'Cribbage — easy flushes',
    group: 'Cribbage',
    blurb: 'Flushes count from three cards. Makes suit a live consideration on short lines.',
    config: cribbageBase({
      cribbage: { ...CONFIG.cribbage, flushMin: 3 },
      targetScore: 660,
    }),
  },
];

export const DEFAULT_RULESET = 'cribbage';

export function getRuleset(id: string): Ruleset {
  return RULESETS.find((r) => r.id === id) ?? RULESETS[0];
}

export function rulesetGroups(): { group: string; items: Ruleset[] }[] {
  const groups: { group: string; items: Ruleset[] }[] = [];
  for (const r of RULESETS) {
    const g = groups.find((x) => x.group === r.group);
    if (g) g.items.push(r);
    else groups.push({ group: r.group, items: [r] });
  }
  return groups;
}
