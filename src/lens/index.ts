import { cribbageLens } from './cribbage';
import { pokerLens } from './poker';
import type { Lens } from './types';

export * from './types';
export { pokerLens } from './poker';
export { cribbageLens } from './cribbage';

export const LENSES: Lens[] = [pokerLens, cribbageLens];

export type LensId = (typeof LENSES)[number]['id'];

export function getLens(id: string): Lens {
  const lens = LENSES.find((l) => l.id === id);
  if (!lens) throw new Error(`unknown lens "${id}"`);
  return lens;
}
