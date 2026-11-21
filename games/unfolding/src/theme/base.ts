/**
 * The base vocabulary: every message the game shows, as templates over a
 * premise's role words. A premise supplies ~40 role words ({hp}, {currency},
 * {restoratives}, {stairsDown}…) and writes its own signature lines (the
 * THEMED_KEYS); everything else is said here, in whatever words the premise
 * gave. A premise may also override any base line.
 *
 * Placeholder conventions:
 *  - role words: {hp}, {foes}, {shrineName}… (see ROLE_KEYS)
 *  - capitalised: {Foes} is {foes} with a capital letter
 *  - elements: {ember}/{Ember}, {frost}/{Frost}
 *  - foe plurals for each genotype: {foes_rat}, {foes_bat}, {foes_goblin}, {foes_slime}
 *  - call-site values: {n}, {item}, {foe}, {name}…
 */
import type { RuleId } from '../engine/types.ts';
import type { HarmId } from '../rules/harm.ts';

export const ROLE_KEYS = [
  'heir',
  'depth',
  'floor',
  'hp',
  'mana',
  'satiety',
  'hungry',
  'fed',
  'starving',
  'level',
  'xp',
  'str',
  'agi',
  'vit',
  'cleave',
  'mend',
  'currency',
  'restorative',
  'restoratives',
  'weapon',
  'weapons',
  'armor',
  'arms',
  'fists',
  'food',
  'foe',
  'foes',
  'shrine',
  'shrineName',
  'grave',
  'graves',
  'stairsDown',
  'stairsUp',
  'stone',
  'stones',
  'pack',
  /** Volley: one shot, many shots. Every premise names them, whatever its means. */
  'ammo',
  'ammos',
  /** The shrine that settles an open question about the world, once. */
  'schism',
  /** Commerce: who sells. */
  'merchant',
  /** The Heart (M-55): what lies at the bottom of an Age, with its article ("the Corner Office"). */
  'heart',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];
export type Roles = Record<RoleKey, string>;

/** Every message key, in the base vocabulary. */
export const BASE_TEXT = {
  // --- Arrival -------------------------------------------------------------
  'start.fresh': 'You wake in a quiet room. A {shrine} waits in the corner; the {stairsDown} lead on.',
  'start.hint': 'Move with the arrow keys or by tapping the map; hold a spot to walk there. Step onto the {shrine} (Ω) to change the world.',
  'start.heir': '{name} arrives in {world}, {heir} to {n} rules.',
  'intrusion.restorative': 'The {restoratives} here come from {donor}.',
  'intrusion.foes': 'The {foes} here come from {donor}.',
  'intrusion.arms': 'The {weapons} and {armor} here come from {donor}.',
  'intrusion.currency': 'The {currency} here came from {donor}.',
  'intrusion.sustenance': 'The {food} here came from {donor}.',
  'floor.changed': 'This {floor} has changed since you were last here.',
  'graves.one': 'You sense a {grave} on this {floor}.',
  'graves.many': 'You sense {n} {graves} on this {floor}.',

  // --- Stairs --------------------------------------------------------------
  'stairs.down.here': 'The {stairsDown} lead on. Press > to go.',
  'stairs.up.here': 'The {stairsUp} lead back to {depth} {n}. Press < to go back.',
  'stairs.down.none': 'There is no way down here.',
  'stairs.up.none': 'There is no way back up here.',
  'stairs.descend': 'You go on to {depth} {n}.',
  'stairs.ascend': 'You go back to {depth} {n}.',

  // --- Items ---------------------------------------------------------------
  'pickup.see': 'You see {what} here. Press g to pick up.',
  'list.sep': ', ',
  'list.and': '{rest} and {last}',
  'pickup.currency': 'You pick up {n} {currency}.',
  'pickup.item': 'You pick up the {item}.',
  'pickup.full': 'Your {pack} is full; you leave the {item}.',
  'pickup.nothing': 'There is nothing here to pick up.',
  'pack.full': 'Your {pack} is full.',
  'drop': 'You drop the {item}.',
  'drink': 'You use the {item} and recover {n} {hp}.',
  'eat': 'You consume the {item}.',
  'eat.never': 'You have no need of that. Not yet.',
  'equip.weapon': 'You take up the {item}.',
  'equip.armor': 'You put on the {item}.',
  'heavy.weapon': 'The {item} is heavier than your {str}. Attacks will take 2 turns.',
  'heavy.armor': 'The {item} is heavier than your {str}. Moving will take 2 turns.',
  'unequip': 'You put away the {item}.',
  'item.currency': '{n} {currency}',
  'item.ammo': '{n} {ammos}',
  'pickup.ammo': 'You gather {n} {ammos}.',
  'item.elemental': '{Element} {item}',

  // --- Abilities -----------------------------------------------------------
  'ability.cleave': '{cleave}',
  'ability.mend': '{mend}',
  'ability.nomana': 'Not enough {mana} ({ability} needs {n}).',
  'cleave.none': 'Nothing is close enough.',
  'cleave': 'You strike everything around you!',
  'mend': 'You recover {n} {hp}.',

  // --- Shrines and rules ---------------------------------------------------
  'shrine.dark': 'Behind you, the {shrine} goes dark.',
  'shrine.silent': 'The {shrine} is silent. There is nothing left for it to teach.',
  'shrine.open': 'The {shrineName} stirs. It offers to change the world.',
  'shrine.stepback': 'You step back from the {shrine}. It will wait — for this {floor}.',
  'shrine.heal': 'The {shrine} restores you fully.',
  'rule.new': 'NEW RULE — {rule}: {tagline}',
  'rule.repealed': '{rule} is repealed. It leaves the world.',
  'adopt.peril': '{Foes} appear.',
  'adopt.things': 'Things appear around you.',
  'adopt.elements': '{n} {stones} turn {ember} and {frost}.',
  'adopt.halls': 'The {floor} opens up. The {stairsDown} are somewhere else now.',

  // --- Terrain -------------------------------------------------------------
  'frost.you': 'The {frost} {stone} holds you fast. You lose a turn.',
  'glimmer.ember': 'The {stone} here is faintly warm.',
  'glimmer.frost': 'The {stone} here is faintly cold.',
  'ember.you': 'The {ember} {stone} hurts you for {n}.',
  'ember.foe': 'The {foe} is hurt by the {ember} {stone}.',
  'frost.foe': 'The {foe} is held fast by the {frost} {stone}.',

  // --- Growth --------------------------------------------------------------
  'stat.str': '{str}',
  'stat.agi': '{agi}',
  'stat.vit': '{vit}',
  'levelup.stat': '{stat} rises to {n}.',
  'levelup.reached': 'You reach {level} {n}!',

  // --- Graves --------------------------------------------------------------
  'grave.epitaph': 'A {grave}: {name}, {heir} {gen} — {epitaph}.',
  'grave.unusable': 'Something of theirs is here, but this world no longer has a rule for it.',
  'grave.full': 'Your {pack} is too full to take what they left.',
  'grave.recover': 'You recover their {item}.',

  // --- Commerce ------------------------------------------------------------
  'shop.open': 'The {merchant} shows you what they have.',
  'shop.buy': 'You buy the {item} for {n} {currency}.',
  'shop.sell': 'You sell the {item} for {n} {currency}.',
  'shop.poor': 'You can’t afford that.',
  'shop.leave': 'You leave the {merchant}.',
  'shop.empty': 'The {merchant} has nothing left to sell.',
  'shop.price': '{n} {currency}',
  'shrine.reroll': 'The {shrine} reconsiders, and offers something else.',
  'shrine.reroll.button': 'Pay {n} {currency} for other offers',
  'adopt.commerce': 'Somewhere on this {floor}, a {merchant} sets up.',
  'note.commerce': 'A {merchant} sets up on this {floor} and every {floor} after.',

  // --- Means of Harm -------------------------------------------------------
  'axiom.harm': 'HOW HARM WORKS — {name}: {tagline}',
  'schism.appears': 'A {schism} rises on this {floor}. It will settle how harm works in this world, for good.',
  'schism.open': 'The {schism} asks how harm should work here. Whatever you choose, every {heir} after you inherits.',
  'schism.stepback': 'You step away from the {schism}. It will ask again.',
  'fire.strike': 'Here, harm is done up close: walk into {a:foe}.',
  'fire.none': 'Nothing within reach.',
  'volley.empty': 'You are out of {ammos}.',
  'volley.wide': 'The shot goes wide.',
  'arcanum.nomana': 'Not enough {mana}: a bolt needs {n}.',
  'arcanum.fizzle': 'The bolt strikes nothing.',
  'discourse.overheard': '{n} more overhear you, and turn.',
  'shove': 'You shove the {foe} back. It stumbles.',
  'shove.stuck': 'The {foe} has nowhere to go.',
  'foe.shoots': 'The {foe} hits you from afar for {n}.',
  'foe.shoots.miss': 'The {foe} aims at you and misses.',

  // --- Combat --------------------------------------------------------------
  'foe.elemental': '{element} {foe}',
  'attack.miss': 'You miss the {foe}.',
  'attack.hit': 'You hit the {foe} for {n}{notes}.',
  'attack.notes': ' — {list}',
  'attack.note.resist': 'it resists',
  'attack.note.weak': 'it’s weak to that!',
  'attack.note.sneak': 'sneak attack!',
  'attack.note.shatter': 'your {item} breaks in a final blow',
  'attack.stagger': 'The {foe} staggers.',
  'foe.miss': 'The {foe} misses you.',
  'foe.hit': 'The {foe} hits you for {n}.',
  'foe.dies': 'The {foe} is gone.',
  'armor.breaks': 'Your {item} falls apart.',
  'starving': 'You are {starving}.',
  'death': 'It ends — {cause}.',
  // --- The Heart (M-55) ----------------------------------------------------
  'heart.near': 'This is the deepest {floor} of the Age. {Heart} (♥) waits at its far end.',
  'heart.here': '{Heart} is here. Press > to reach it, and end this Age.',
  'heart.win': '{name} reaches {heart}. This Age is over.',
  'cause.won': 'reached {heart} on {depth} {n}',
  'age.begin': 'Age {age} begins. {name} reached {heart} in the last one.',
  'age.reset.rules': 'The world lets go of its rules, but keeps its {graves}.',
  'age.reset.all': 'The world lets go of its rules and how it works, but keeps its {graves}.',
  'look.heart': '{Heart}',
  'look.heart.line': 'The end of this Age. Step on it and press > to win.',
  'hud.heart.depth': '{Heart} lies on {depth} {n}.',
  // --- Flow of Time: Tide Clock (M-24) -----------------------------------
  'axiom.tide': 'HOW TIME WORKS — {name}: {tagline}',
  'tide.1': 'The clock reaches its first mark. More {foes} arrive.',
  'tide.2': 'The clock reaches its second mark. Every {foe} on this {floor} knows where you are.',
  'tide.3': 'The clock has run out. This {floor} will hurt you until you leave it.',
  'tide.hurt': 'Time is up here. −1 {hp}.',
  'cause.tide': 'out of time on {depth} {n}',
  'hud.tide': '{n} turns to the next mark',
  'hud.tide.struck': 'Time is up: leave this {floor}',
  'hud.tide.waits': 'Starts when {foes} arrive',
  'cause.slain': 'undone by {a} {foe} on {depth} {n}',
  'cause.starved': '{starving} on {depth} {n}',
  'cause.burned': 'caught by {a} {ember} {stone} on {depth} {n}',

  // --- Auto-travel ---------------------------------------------------------
  'travel.unknown': 'You don’t know a way there.',
  'travel.unreachable': 'You can’t get there from here.',
  'travel.adjacent': 'Not with {a} {foe} beside you.',
  'travel.blocked': 'The way is blocked. You stop.',
  'travel.inway': 'Something is in the way. You stop.',
  'travel.hurt': 'You’re hurt! You stop.',
  'travel.upon': '{A} {foe} is upon you! You stop.',
  'travel.spot': 'You spot {a} {foe} ({glyph}). You stop.',
  'travel.stop': 'You stop.',

  // --- Shrine preview ------------------------------------------------------
  'preview.maxHp': 'Max {hp}',
  'preview.attack': 'Attack',
  'preview.defense': 'Defense',
  'preview.hit': 'Your hit chance',
  'preview.enemyHit': 'Foe hit chance',
  'preview.attackCost': 'Attack cost',
  'preview.moveCost': 'Move cost',
  'preview.stagger': 'Stagger chance',
  'preview.sight': 'Sight',
  'preview.sneak': 'Sneak attack',
  'preview.maxMana': '{Mana}',
  'preview.range': 'Reach',
  'turns.one': '1 turn',
  'turns.many': '{n} turns',
  'sight.all': 'whole {floor}',
  'sight.n': '{n} tiles',
  'sneak.none': '—',
  'sneak.mult': '×{n}',
  'note.halls': 'This {floor} opens up right away — and its {stairsDown} move somewhere you haven’t been.',
  'note.peril': '{Foes} will appear on this {floor}. Until now nothing here could touch you.',
  'note.things': 'Things will appear on this {floor} and every {floor} after.',
  'note.growth': 'Your {str}, {agi} and {vit} (all 3) start to matter. You are {level} 1.',
  'note.arms': '{Weapons} and {armor} will appear, starting on this {floor}.',
  'note.carry.none': 'You carry nothing it applies to — yet.',
  'note.weight.item': '{item} weighs {w} vs your {str} {have} — {verdict}.',
  'note.weight.ok': 'within your strength',
  'note.weight.heavy.weapon': 'too heavy: attacks take 2 turns if equipped',
  'note.weight.heavy.armor': 'too heavy: moving takes 2 turns if equipped',
  'note.durability.item': '{item}: {n} uses before it breaks.',
  'note.elements.item': '{item} is {el}: ×2 against {opp} {foes}, ½ against {el} {foes}.',
  'note.elements.none': 'None of your {arms} carry an element.',
  'note.elements.glimmers': '{n} {stones} on this {floor} will awaken.',
  'note.darkness': 'All {n} {foes} on this {floor} lose track of you.',
  'note.hunger': 'You start with full {satiety} ({n}).',
  'note.arcana': 'Learn {cleave} ({c} {mana}) and {mend} ({m} {mana}). You start with {n} {mana}.',
  'note.variant': 'This world: {name} — {text}',

  // --- HUD -----------------------------------------------------------------
  'hud.hp': '{hp}',
  'hud.hpOf': '{hp} {n}/{max}',
  'hud.mana': '{Mana}',
  'hud.manaCost': '{n} {mana}',
  'hud.satiety': '{Satiety}',
  'hud.starving': '{Starving}',
  'hud.hungry': '{Hungry}',
  'hud.fed': '{Fed}',
  'hud.level': '{Level} {n}',
  'hud.xp': '{n}/{max} {xp}',
  'hud.unhurt': 'Nothing here can hurt you. Yet.',
  'hud.fists': 'No {weapon} — {fists}',
  'hud.noArmor': 'No {armor}',
  'hud.noRules': 'This world has no rules yet: one room, a {shrine}, and a way down.',
  'hud.depth': '{Depth} {n}',
  'hud.heir': '{heir} {n}',
  'hud.shrineDepth': '{shrineName} · {depth} {n}',
  'hud.pack': '{Pack}',
  'hud.ammo': '{Ammos}',
  'hud.harm': 'How harm works',
  'hud.harm.open': 'Unsettled: a {schism} will decide. Until then you strike.',
  'hud.fire': 'Fire',
  'fact.heals': 'Heals {n}',
  'fact.nourish': '{Satiety} +{n}',
  'fact.attack': 'Attack +{n}',
  'fact.defense': 'Defense +{n}',
  'fact.weight': 'Weight {n}',
  'fact.tooHeavy': ' — too heavy',
  'fact.durability': 'Durability {n}/{max}',
  'levelup.blurb.str': 'Damage',
  'levelup.blurb.strWeight': 'Damage, and what you can wield',
  'levelup.blurb.agi': 'Hit more, get hit less',
  'levelup.blurb.vit': '+4 max {hp}',
  'levelup.maxHp': 'Max {hp} {a} → {b}',
  'help.use': 'Use {restoratives} / {food}',
  'help.abilities': '{cleave} / {mend} (with {arcana})',
  'help.fire': 'Harm the nearest {foe} in reach (or aim with Look)',
  'help.legend':
    'Legend: <b>@</b> you · <b>&gt;</b> {stairsDown} · <b>&lt;</b> {stairsUp} · <b>Ω</b> {shrine} · <b>†</b> {grave} · <b>!</b> {restorative} · <b>$</b> {currency} · <b>)</b> {weapon} · <b>[</b> {armor} · <b>%</b> {food} · ◇ a property you can\'t perceive yet',

  // --- Screens -------------------------------------------------------------
  'screen.graves.one': '{n} {grave}',
  'screen.graves.many': '{n} {graves}',
  'screen.resume': 'Resume {name} · {depth} {n}',
  'screen.fell': '{name} fell — {cause}. Their {grave} remains where they fell.',
  'screen.won': '{name} reached {heart} — the last Age is over.',
  'screen.graveNow': 'Their {grave} now lies on {depth} {n}. The world keeps every rule it has learned.',

  // --- Look ----------------------------------------------------------------
  'look.nothing': 'Nothing',
  'look.unknown': 'Unknown',
  'look.unseen': 'You haven’t seen this part of the {floor}.',
  'look.remembered': 'Remembered — you can’t see it from here.',
  'look.you': 'You ({name})',
  'look.foeHp': '{hp} {n}/{max}',
  'look.foeHits': 'hits you for {n}',
  'look.foeArmor': 'armour {n}',
  'look.fast': 'Fast and erratic.',
  'look.slow': 'Slow: acts every other turn.',
  'look.stunned': 'Stunned.',
  'look.unaware': 'It hasn’t noticed you: a sneak attack does ×{n}.',
  'look.resists': 'It resists your {el} {weapon} (½ damage).',
  'look.weak': 'It’s weak to your {el} {weapon} (×2 damage).',
  'look.hidden.one': ' · {n} thing you can’t perceive yet',
  'look.hidden.many': ' · {n} things you can’t perceive yet',
  'look.wall': 'Wall',
  'look.floor': 'Floor',
  'look.stairsDown': '{StairsDown}',
  'look.stairsDownLine': 'Leads to {depth} {n}.',
  'look.stairsUp': '{StairsUp}',
  'look.stairsUpLine': 'Leads back to {depth} {n}, as you left it.',
  'look.shrine': '{shrineName}',
  'look.shrine.dark': 'Dark: you left this {floor} without answering it.',
  'look.shrine.spent': 'Spent: it has already changed this world.',
  'look.shrine.offers': 'Offers: {list}. Step onto it to choose.',
  'look.shrine.unseen': 'Step onto it to see what it offers.',
  'look.grave': '{Grave} of {name}',
  'look.grave.line': '{Heir} {gen}: {epitaph}.',
  'look.grave.empty': 'Nothing is left in it.',
  'look.grave.full': 'Something of theirs is still here.',
  'look.stone': '{Element} {stone}',
  'look.ember': 'Hurts anyone who ends a turn on it, for {n}.',
  'look.frost': 'Holds anyone who steps on it for a turn.',
  'look.glimmer': '{Stone}',
  'look.glimmer.ember': 'Faintly warm. It does nothing — yet.',
  'look.glimmer.frost': 'Faintly cold. It does nothing — yet.',
  'look.underfoot': 'Underfoot: {terrain}.',
  'look.rock': 'Solid.',
  'look.gloss': '{what}',
  'look.merchant': '{Merchant}',
  'look.merchant.line': 'Step onto it to trade. {n} things for sale.',
  'look.schism': '{Schism}',
  'look.schism.line': 'Step onto it to settle how harm works in this world. Offers: {list}.',
  'look.inReach': 'Within your reach.',
};

export type MessageKey = keyof typeof BASE_TEXT;

/**
 * Lines that carry a world's voice. Every themed premise must write these
 * itself; the base versions above are only fallbacks for The Plain vocabulary.
 */
export const THEMED_KEYS = [
  'start.fresh',
  'graves.one',
  'graves.many',
  'stairs.down.here',
  'stairs.up.here',
  'stairs.down.none',
  'stairs.up.none',
  'stairs.descend',
  'stairs.ascend',
  'drink',
  'eat',
  'eat.never',
  'equip.weapon',
  'equip.armor',
  'cleave.none',
  'cleave',
  'mend',
  'shrine.dark',
  'shrine.silent',
  'shrine.open',
  'shrine.stepback',
  'shrine.heal',
  'adopt.peril',
  'adopt.things',
  'adopt.elements',
  'adopt.halls',
  'frost.you',
  'glimmer.ember',
  'glimmer.frost',
  'ember.you',
  'ember.foe',
  'frost.foe',
  'levelup.reached',
  'grave.epitaph',
  'grave.unusable',
  'attack.miss',
  'attack.hit',
  'attack.stagger',
  'foe.miss',
  'foe.hit',
  'foe.dies',
  'starving',
  'death',
  'cause.slain',
  'cause.starved',
  'cause.burned',
  'note.halls',
  'note.peril',
  'note.things',
  'note.elements.glimmers',
  'hud.unhurt',
  'hud.fists',
  'hud.noRules',
  'look.wall',
  'look.floor',
  'look.glimmer',
  'look.glimmer.ember',
  'look.glimmer.frost',
  'look.rock',
  'shop.open',
  'shop.poor',
  'shrine.reroll',
  'schism.appears',
  'schism.open',
  'adopt.commerce',
  'heart.win',
  'tide.1',
  'tide.2',
  'tide.3',
  'tide.hurt',
  'cause.tide',
] as const satisfies readonly MessageKey[];

export type ThemedKey = (typeof THEMED_KEYS)[number];

/**
 * The parts of a rule's text that describe mechanics. Premises write a rule's
 * name, tagline, summary and variant name; these come from here unless a
 * premise overrides them. {r_growth} etc. are rule names in the same world.
 */
export const BASE_RULE_TEXT: Record<RuleId, { upside: string; downside: string; variant: string; earned?: string; imposed?: string }> = {
  halls: {
    upside: 'Bigger {floor}s hold more to find.',
    downside: 'The way on is no longer in plain sight.',
    variant: 'Up to three more rooms on each {floor}.',
  },
  peril: {
    upside: '{Foes} open the way to {r_growth}, {r_arms}, {r_darkness} and {r_hunger}.',
    downside: 'You can be hurt, and it can end.',
    variant: 'Max {hp} {frailHp} instead of {baseHp}.',
  },
  things: {
    upside: '{Restoratives} to heal you; {foes} drop {currency}.',
    downside: 'Nothing yet. This one is a gift.',
    variant: '{Restoratives} heal half again as much.',
    earned: 'Also arrives once you have seen off five {foes}.',
  },
  growth: {
    upside: 'Choose a stat each {level}; {hp} grows.',
    downside: 'You can miss now. {Foes} grow faster as you go deeper.',
    variant: 'Each {level} needs 30% less {xp}.',
  },
  arms: {
    upside: '{Weapons} add attack; {armor} subtracts damage taken.',
    downside: '{Fists} weaken (2 → 1).',
    variant: 'Twice as many {arms} appear.',
  },
  weight: {
    upside: '{A:weapon} within your {str} staggers {foes} (weight × 8%). {Armor} within your {str} absorbs +1 per 3 weight.',
    downside: '{A:weapon} heavier than your {str}: attacks take 2 turns. {Armor} heavier than your {str}: moving takes 2 turns.',
    variant: 'Everything weighs 1 more.',
  },
  durability: {
    upside: '{Weapons} +2 attack, {armor} +1 defense while they last. A breaking {weapon} strikes for triple.',
    downside: 'Your {arms} will break.',
    variant: '{Arms} wear twice as fast.',
  },
  elements: {
    upside: '{Ember} and {frost} {weapons} deal double to the opposite kind. Lure {foes} onto {stones}.',
    downside: '{Stones} hurt you too. {Foes} of the same kind take half.',
    variant: '{Ember} {stones} hurt for {wildfireBurn} instead of {emberBurn}.',
  },
  darkness: {
    upside: 'Unaware {foes} take double damage. Every {foe} loses track of you now.',
    downside: 'You can no longer see the whole {floor}.',
    variant: 'Sight radius 3 instead of 5.',
  },
  hunger: {
    upside: 'While at least {regenPct}% {fed}, regenerate 1 {hp} every {regenEvery} turns. Nothing else regenerates.',
    downside: '{Satiety} drains every turn, and {food} will be hard to find. At zero, lose 1 {hp} every {starveEvery} turns.',
    variant: '{Satiety} drains half again as fast.',
  },
  arcana: {
    upside: 'Two abilities.',
    downside: '−4 max {hp}.',
    variant: '{Mana} returns twice as fast.',
  },
  commerce: {
    upside: 'A {merchant} on every {floor}: buy what you need, sell what you don’t. Pay a {shrine} to show other offers.',
    downside: 'Fewer {restoratives} lie about for free, and prices rise as you go deeper.',
    variant: 'Everything costs a quarter less.',
  },
  bestiary: {
    upside: 'More {xp} and more drops.',
    downside: 'More dangerous {foes}.',
    variant: 'Two more {foes} on every {floor}.',
    imposed: 'Never offered at shrines: it arrives on its own as you go deeper.',
  },
};

/**
 * What a world can borrow from another premise. An intrusion replaces these
 * role words, item names and lines with the donor's.
 */
export const BUNDLES = {
  restorative: { roles: ['restorative', 'restoratives'], items: ['restorative'], text: ['drink'] },
  foes: { roles: ['foe', 'foes'], items: [], text: ['adopt.peril', 'foe.miss', 'foe.hit', 'foe.dies'], foes: true },
  arms: { roles: ['weapon', 'weapons', 'armor', 'arms', 'fists'], items: ['weapons', 'armors'], text: ['equip.weapon', 'equip.armor', 'hud.fists'] },
  currency: { roles: ['currency'], items: ['currency'], text: [] },
  sustenance: { roles: ['satiety', 'hungry', 'fed', 'starving', 'food'], items: ['foods'], text: ['eat', 'eat.never', 'starving'] },
} as const satisfies Record<string, { roles: readonly RoleKey[]; items: readonly string[]; text: readonly MessageKey[]; foes?: boolean }>;

export type BundleId = keyof typeof BUNDLES;

// ---------------------------------------------------------------------------
// Means of Harm
// ---------------------------------------------------------------------------

/**
 * Lines each means says differently from Strike, in the base vocabulary. A
 * premise's own means words override these, which override its Strike lines.
 */
export const BASE_MEANS_TEXT: Record<HarmId, Partial<Record<MessageKey, string>>> = {
  strike: {},
  volley: {
    'attack.hit': 'Your shot hits the {foe} for {n}{notes}.',
    'attack.miss': 'Your shot misses the {foe}.',
    'attack.stagger': 'The {foe} reels from the impact.',
    'attack.note.shatter': 'your {item} gives out on a final shot',
    'fire.none': 'No clear shot at anything.',
    'hud.fire': 'Fire',
    'cleave': 'You loose a spray at point-blank range!',
    'cleave.none': 'Nothing is close enough for a spray.',
    'look.foeHits': 'hits you for {n}',
  },
  arcanum: {
    'attack.hit': 'The bolt sears the {foe} for {n}{notes}.',
    'attack.miss': 'The bolt slides past the {foe}.',
    'attack.stagger': 'The {foe} is thrown off balance.',
    'attack.note.shatter': 'your {item} burns out on a final bolt',
    'fire.none': 'Nothing on a line within reach.',
    'hud.fire': 'Cast',
    'cleave': 'Power bursts out of you in every direction!',
  },
  discourse: {
    'attack.hit': 'Your words land on the {foe}: {n}{notes}.',
    'attack.miss': 'The {foe} isn’t listening.',
    'attack.stagger': 'The {foe} is flustered and loses a turn.',
    'attack.note.shatter': 'your {item} is worn out, and goes out with a bang',
    'attack.note.sneak': 'caught off guard!',
    'foe.dies': 'The {foe} has heard enough, and leaves.',
    'fire.none': 'No one within earshot.',
    'hud.fire': 'Speak',
    'cleave': 'You address the whole room at once!',
  },
};

/** Lines every themed premise must write for each means other than Strike. */
export const MEANS_THEMED_KEYS: Record<HarmId, readonly MessageKey[]> = {
  strike: [],
  volley: ['attack.hit', 'attack.miss', 'attack.stagger', 'volley.wide', 'shove', 'fire.none'],
  arcanum: ['attack.hit', 'attack.miss', 'attack.stagger', 'arcanum.fizzle', 'shove', 'fire.none'],
  discourse: ['attack.hit', 'attack.miss', 'attack.stagger', 'foe.dies', 'discourse.overheard', 'fire.none'],
};

/** Role words a themed premise must re-word for each means (what you harm with, and with what). */
export const MEANS_ROLES: Record<HarmId, readonly RoleKey[]> = {
  strike: [],
  volley: ['weapon', 'weapons', 'fists', 'ammo', 'ammos'],
  arcanum: ['weapon', 'weapons', 'fists'],
  discourse: ['weapon', 'weapons', 'fists'],
};

/** What each means does, in mechanical terms: the Codex, banner and schism cards. */
export const BASE_MEANS_RULE: Record<HarmId, { upside: string; downside: string }> = {
  strike: {
    upside: 'Walk into {a:foe} to harm it, at full strength. You guard as you close in: blows from {foes} beside you land {strikeGuard} lighter.',
    downside: 'You have to be next to whatever you harm.',
  },
  volley: {
    upside: 'Harm from up to {volleyRange} tiles away: the first body in the line takes the shot.',
    downside: 'Shots hit at {volleyPower}% of your attack, and walking into {a:foe} only shoves it. Every shot spends one of your {ammos}; collect them where they land. Some {foes} keep their distance and shoot back.',
  },
  arcanum: {
    upside: 'A bolt reaches {arcanumRange} tiles and passes through everything on its line.',
    downside: 'Bolts hit at {arcanumPower}% of your attack, and walking into {a:foe} only shoves it. Each bolt costs {boltCost} {mana}, and {mana} comes back slowly.',
  },
  discourse: {
    upside: 'Harm anyone within {earshot} steps, around corners, without a clear line.',
    downside: 'Words land at {discoursePower}% of your attack. Everyone within earshot hears them and turns, and {foes} left alone gather their {hp} again.',
  },
};
