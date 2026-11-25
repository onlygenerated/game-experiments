/**
 * The simulator's vocabulary: one icon, one colour and one name per kind of
 * thing, used the same way in the legend, the choices, the floor and the tree.
 * Names are The Plain words, so they say what a thing does.
 */
import { MONSTERS } from '../engine/content.ts';
import { BALANCE as B } from '../engine/balance.ts';
import type { MonsterKind } from '../engine/types.ts';
import { HARMS, MEANS } from '../rules/harm.ts';
import { lexiconOf } from '../theme/lexicon.ts';
import type { ChoiceKind, RuleState } from './driver.ts';

export const PLAIN = lexiconOf('old-stone', [], true);

export const KIND: Record<ChoiceKind, { icon: string; name: string; color: string; text: string }> = {
  shrine: { icon: '◆', name: 'Rule shrine', color: 'var(--k-shrine)', text: 'Draft one of up to 3 rules. Drafting heals you fully. Step back and it waits; leave the floor and it goes dark.' },
  schism: { icon: '✦', name: 'Schism shrine', color: 'var(--k-schism)', text: 'Settles one open axiom for the whole world, for good: how harm works, the shape of floors, or how time flows.' },
  levelup: { icon: '▲', name: 'Level-up', color: 'var(--k-level)', text: 'Under Growth: +1 STR (damage), AGI (hit and dodge) or VIT (max HP).' },
  fight: { icon: '⚔', name: 'Fight', color: 'var(--k-fight)', text: 'Walks to a foe and fights it with this world’s means of harm, using real turns.' },
  items: { icon: '◇', name: 'Items', color: 'var(--k-items)', text: 'Walks over each item and picks it up.' },
  merchant: { icon: '¤', name: 'Merchant', color: 'var(--k-shop)', text: 'Under Commerce: buy and sell. At a shrine, currency can buy other offers once.' },
  care: { icon: '✚', name: 'Recover', color: 'var(--k-care)', text: 'Use a healing item, eat, or equip better arms. Takes a turn.' },
  stairs: { icon: '▼', name: 'Stairs down', color: 'var(--k-stairs)', text: 'Walk to the stairs and go down. Rules that impose themselves arrive on the way.' },
  heart: { icon: '♥', name: 'The Heart', color: 'var(--k-heart)', text: 'The deepest floor of an Age has the Heart instead of stairs. Reaching it ends the Age.' },
  death: { icon: '✝', name: 'Death', color: 'var(--k-death)', text: 'The run ends and leaves a grave. A new heir starts at depth 1 with the world’s rules.' },
  start: { icon: '●', name: 'Start', color: 'var(--k-start)', text: 'A new heir begins.' },
};

export const ARRIVAL: Record<'shrine' | 'milestone' | 'mastery', { name: string; text: string }> = {
  shrine: { name: 'Drafted', text: 'You picked it at a rule shrine.' },
  milestone: { name: 'Imposed', text: 'It arrived by itself on the stairs, once it had emerged and its prerequisites were in (Bestiary).' },
  mastery: { name: 'Mastery', text: `Earned: ${5} kills before Things exists brings Things.` },
};

export const RULE_STATE: Record<RuleState, { name: string; text: string }> = {
  adopted: { name: 'In the world', text: 'Adopted. Its effects apply now.' },
  offered: { name: 'On offer', text: 'The open shrine is offering it.' },
  available: { name: 'Draftable', text: 'A shrine on this floor could offer it.' },
  waiting: { name: 'Not yet', text: 'Prerequisites met, but it emerges deeper in this world.' },
  imposed: { name: 'Imposed', text: 'Never offered. It arrives by itself at its depth.' },
  locked: { name: 'Locked', text: 'A prerequisite is missing.' },
  excluded: { name: 'Absent', text: 'Not in this world’s pool.' },
};

/** How each Means of Harm fights: the battle types. */
export function harmFacts() {
  return HARMS.map((id) => {
    const m = MEANS[id];
    const w = lexiconOf('old-stone', [], true, id).means(id);
    const reach = { adjacent: 'Adjacent only', shot: `A line up to ${m.range}; stops at the first foe`, pierce: `A line up to ${m.range}; passes through every foe`, earshot: `Anyone within ${m.range} steps, around corners` }[m.reach];
    const cost = { none: 'Free', ammo: 'One shot each; shots land and can be picked up', mana: `${B.harm.boltCost} mana each` }[m.cost];
    const bump = m.bump === 'harm' ? 'Walking into a foe harms it' : 'Walking into a foe shoves it a tile';
    const power = B.harm.power[id];
    return { id, name: w.name, tagline: w.tagline, summary: w.summary, reach, cost, bump, power: power === 1 ? 'Full attack' : `Attack ×${power}, rounded up` };
  });
}

const FOE_TRAITS: Record<MonsterKind, string> = {
  rat: 'Plain. The only foe until Bestiary.',
  bat: 'Fast: moves twice a turn, erratically.',
  goblin: 'Armoured. Under Volley it keeps its distance and shoots back.',
  slime: 'Slow: acts every other turn. Lots of HP.',
};
const FOE_FROM: Record<MonsterKind, string> = { rat: 'With Peril', bat: 'Bestiary', goblin: 'Bestiary, depth 4+', slime: 'Bestiary, depth 5+' };

export function foeFacts() {
  return (['rat', 'bat', 'goblin', 'slime'] as MonsterKind[]).map((kind) => {
    const d = MONSTERS[kind];
    const look = PLAIN.foe(kind);
    return { kind, name: look.name, glyph: look.glyph, color: look.color, hp: d.hp, atk: d.atk, def: d.def, xp: d.xp, trait: FOE_TRAITS[kind], from: FOE_FROM[kind] };
  });
}

export const SHAPES = {
  solo: { icon: '▢', name: 'Single room', text: 'Before Halls, a floor is one room.' },
  rooms: { icon: '▦', name: 'Rooms', text: PLAIN.space('rooms').summary },
  caverns: { icon: '◌', name: 'Caverns', text: PLAIN.space('caverns').summary },
  drift: { icon: '⟲', name: 'Drift', text: PLAIN.space('drift').summary },
};

export const TIMES = {
  turns: { icon: '·', name: 'Turns', text: PLAIN.time('turns').summary },
  tide: { icon: '◷', name: 'Tide Clock', text: PLAIN.time('tide').summary },
};

export const HAZARDS = [
  { icon: '▲', color: 'var(--ember)', name: 'Hot stone', text: `Under Elements: −${B.elements.emberBurn} HP each turn you end on it. Burns foes too.` },
  { icon: '▲', color: 'var(--frost)', name: 'Cold stone', text: 'Under Elements: stepping on it costs a turn.' },
  { icon: '◐', color: 'var(--muted)', name: 'Darkness', text: 'You see only nearby; foes notice you only up close, so you can sneak up for double damage.' },
];
