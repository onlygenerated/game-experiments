/**
 * Every tuning number in one place. Measure changes with the balance probe:
 *
 *   npx vite-node tools/probe.ts
 *
 * Rule texts in rules.ts quote some of these; keep them in step.
 */
export const BALANCE = {
  player: {
    hp: 20,
    /** The Frail variant of Peril. */
    frailHp: 16,
  },
  potion: {
    heal: 8,
    /** The Generous Springs variant of Things. */
    generousMult: 1.5,
  },
  hunger: {
    maxSatiety: 500,
    drainPerTurn: 1,
    /** The Lean Years variant of Hunger. */
    leanMult: 1.5,
    /** While starving, lose 1 HP every this many turns. */
    starveEvery: 5,
    /** Regenerate while satiety is at least this fraction of max… */
    regenAbove: 0.5,
    /** …at 1 HP every this many turns. */
    regenEvery: 10,
  },
  food: {
    /** [satiety, weight] — which food a drop or floor spawn is. Names come from the premise. */
    kinds: [
      [250, 0.55],
      [120, 0.45],
    ] as [number, number][],
    /** Floor spawns: always this many… */
    perFloor: 1,
    /** …plus one more with this chance. */
    extraChance: 0.2,
  },
  loot: {
    potionsPerFloor: [1, 2] as [number, number],
    goldPilesPerFloor: [1, 3] as [number, number],
    /** Gold pile size: [min, max] + depth × perDepth. */
    goldPile: [3, 8] as [number, number],
    goldPerDepth: 2,
    /** Arms per floor: a weapon and an armour, each with its chance. Smithworld rolls twice. */
    weaponChance: 0.7,
    armorChance: 0.4,
    elementalWeaponChance: 0.3,
  },
  drops: {
    gold: 0.25,
    potion: 0.06,
    food: 0.04,
    arms: 0.03,
    /** Bestiary's "more drops". */
    bestiaryMult: 1.5,
  },
  monsters: {
    /** Foes per floor: min(cap, base + ceil(depth × perDepth)). */
    countBase: 1,
    countPerDepth: 1.5,
    countCap: 18,
    /** Swarming Deep variant of Bestiary. */
    swarmExtra: 2,
    /** A single room holds at most one foe per this many tiles. */
    soloTilesPerFoe: 14,
    /** HP gained per depth below the first (with Growth / without; rounded down). */
    hpPerDepth: [2, 0.6] as [number, number],
    /** +1 attack every this many depths (with Growth / without). */
    atkEveryDepths: [2, 4] as [number, number],
    elementalChance: 0.25,
  },
  growth: {
    /** XP for level L → L+1 is round(xpBase × L^xpExp). */
    xpBase: 6,
    xpExp: 1.65,
    /** Quick Study variant of Growth. */
    quickMult: 0.7,
  },
  arcana: {
    cleaveCost: 2,
    mendCost: 3,
    mendFraction: 0.3,
    /** +1 mana every this many turns (Ley Lines halves it). */
    manaEvery: 10,
    leyManaEvery: 5,
  },
  durability: {
    /** Multiplies every weapon's and armour's base durability (from the tables in content.ts). */
    scale: 2,
  },
  elements: {
    emberBurn: 2,
    wildfireBurn: 4,
  },
} as const;
