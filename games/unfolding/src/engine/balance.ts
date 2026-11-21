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
  /** Commerce: what things cost. Selling fetches half. */
  commerce: {
    potion: [10, 2] as [number, number],
    food: [6, 2] as [number, number],
    /** Arms: base + value × perPoint + depth × perDepth. */
    weapon: [8, 5, 2] as [number, number, number],
    armor: [8, 6, 2] as [number, number, number],
    ammoEach: 2,
    /** Paying a shrine to show other offers: base + depth × perDepth. */
    reroll: [15, 5] as [number, number],
    /** The Fair Prices variant. */
    discount: 0.75,
  },
  /** Means of Harm (Phase 2). Strike has no numbers of its own: it is everything above. */
  harm: {
    /** Volley: how far a shot flies; Weight takes 1 off per 3 weight of a launcher within STR. */
    volleyRange: 6,
    minRange: 2,
    /** Shots you start with when Volley is revealed, and in every new heir's quiver. */
    startAmmo: 8,
    /** Chance a spent shot breaks where it lands (Durability raises it). */
    ammoBreak: 0.15,
    ammoBreakDurability: 0.3,
    /** Bundles of shots lying on each floor under Volley: count and size. */
    ammoPiles: [1, 2] as [number, number],
    ammoPile: [2, 5] as [number, number],
    /** Chance a felled foe leaves a shot or two. */
    ammoDrop: 0.3,
    /** Volley: skirmishers shoot from this far, and keep at least this far back. */
    skirmishRange: 5,
    skirmishKeep: 2,
    /** Arcanum: a bolt's reach, its price, the pool and its refill. */
    arcanumRange: 4,
    boltCost: 1,
    arcanumMana: 3,
    /** +1 mana every this many turns under Arcanum. */
    arcanumManaEvery: 3,
    /** Discourse: how far a barb carries, by path, around corners. */
    earshot: 3,
    /** Discourse: a foe left unaddressed this many turns regains 1 composure (HP) per this many turns. */
    composureEvery: 2,
    /** Harm at a distance lands softer: attack × this, rounded up (so the first floors play alike). */
    power: { strike: 1, volley: 0.65, arcanum: 0.6, discourse: 0.65 },
    /** Strike: you guard as you close in. Blows from foes beside you land this much lighter. */
    strikeGuard: 1,
    /** How many Means of Harm a schism shrine offers. */
    schismOffers: 3,
    /** New worlds: chance the means is left open for a schism shrine, else rolled by weight. */
    openChance: 0.4,
    rollWeights: { strike: 30, volley: 25, arcanum: 25, discourse: 20 },
  },
  /** The Heart (M-55): the deepest floor of an Age. */
  heart: {
    /** Rolled per world and per Age, inclusive. */
    depth: [10, 20] as [number, number],
    /**
     * What a new Age keeps once someone reaches the Heart (Phil chose 'rules', 2026-11-21):
     * 'rules' = the rulebook starts over, axioms stay; 'none' = nothing resets;
     * 'all' = the rulebook starts over and the axioms reopen.
     */
    newAge: 'rules' as 'rules' | 'none' | 'all',
  },
  /** Shape of Space (Phase 3). */
  space: {
    /** New worlds: chance of Caverns instead of rooms and corridors. */
    cavernsChance: 0.25,
    /** Cellular-automaton caves: starting wall fraction and smoothing passes. */
    caveFill: 0.45,
    caveSteps: 5,
    /** Fewest open tiles a cave floor must have, else it is rolled again. */
    caveMinOpen: 420,
    /** Caves are open ground where every foe reaches you at once, so they hold fewer (×, rounded up). */
    caveFoes: 0.75,
  },
  /** Flow of Time (Phase 3). */
  time: {
    /** New worlds: chance of a Tide Clock. */
    tideChance: 0.2,
    /** Turns on a floor (once foes exist) at which the clock reaches each stage. */
    tideStages: [150, 250, 350] as [number, number, number],
    /** Stage 1 and 2: this fraction of a floor's foes arrives, at least this far from you. */
    tideFoes: 0.35,
    tideFoesDistance: 6,
    /** Stage 3: lose 1 vitality every this many turns until you leave the floor. */
    tideHurtEvery: 4,
  },
} as const;
