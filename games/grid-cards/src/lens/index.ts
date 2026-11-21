import type { Config } from '../config';
import { cribbageLens } from './cribbage';
import { combineLenses } from './combine';
import { pokerLens } from './poker';
import type { Lens } from './types';

export * from './types';
export { pokerLens } from './poker';
export { cribbageLens } from './cribbage';
export { combineLenses } from './combine';

export const LENSES: Lens[] = [pokerLens, cribbageLens];

export type LensId = (typeof LENSES)[number]['id'];

export function getLens(id: string): Lens {
  const lens = LENSES.find((l) => l.id === id);
  if (!lens) throw new Error(`unknown lens "${id}"`);
  return lens;
}

/**
 * Which counters are active: the primary lens, plus a second one if the
 * config names one. A second lens equal to the first would just double the
 * score for no reason, so `setup.ts`'s `normalise` keeps that from happening
 * rather than this function silently deduping it.
 */
export function activeLensIds(cfg: Config): string[] {
  return cfg.secondLensId ? [cfg.lensId, cfg.secondLensId] : [cfg.lensId];
}

/** The lens that actually scores a line under this config — one lens, or a sum of several. */
export function getScoringLens(cfg: Config): Lens {
  return combineLenses(activeLensIds(cfg).map(getLens));
}
