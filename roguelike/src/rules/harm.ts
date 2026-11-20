/**
 * Means of Harm: the first axiom family (ROADMAP.md §1.4, M-13 to M-16). A
 * world settles exactly one, and it decides how the player hurts anything:
 *
 *  - strike:    walk into a foe. Everything the game had before Phase 2.
 *  - volley:    fire along a line; the first body stops the shot. Bumping
 *               shoves. Shots are ammunition that lands and can be collected.
 *  - arcanum:   no implements to swing. A bolt pierces everything on its line,
 *               paid for in mana. Bumping shoves.
 *  - discourse: harm is said. Reaches anyone within earshot, around corners;
 *               bystanders hear it, and composure comes back if left alone.
 *
 * Like rule modules, this file is behaviour only. Every word is the premise's.
 */
import { BALANCE as B } from '../engine/balance.ts';

export type HarmId = 'strike' | 'volley' | 'arcanum' | 'discourse';
export const HARMS: HarmId[] = ['strike', 'volley', 'arcanum', 'discourse'];

/** How harm travels when it is aimed rather than bumped. */
export type Reach = 'adjacent' | 'shot' | 'pierce' | 'earshot';

export interface MeansModule {
  id: HarmId;
  /** What walking into a foe does: harm it, or push it a tile away. */
  bump: 'harm' | 'shove';
  reach: Reach;
  /** Tiles, before Weight's adapter. */
  range: number;
  /** What one aimed use costs. */
  cost: 'none' | 'ammo' | 'mana';
}

export const MEANS: Record<HarmId, MeansModule> = {
  strike: { id: 'strike', bump: 'harm', reach: 'adjacent', range: 1, cost: 'none' },
  volley: { id: 'volley', bump: 'shove', reach: 'shot', range: B.harm.volleyRange, cost: 'ammo' },
  arcanum: { id: 'arcanum', bump: 'shove', reach: 'pierce', range: B.harm.arcanumRange, cost: 'mana' },
  discourse: { id: 'discourse', bump: 'harm', reach: 'earshot', range: B.harm.earshot, cost: 'none' },
};

/** Can this means be aimed at something further than arm's length? */
export const aims = (id: HarmId) => MEANS[id].reach !== 'adjacent';
