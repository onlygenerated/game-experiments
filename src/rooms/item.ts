/**
 * Item 14: the inventory substrate and the single hook item effects apply
 * through. Items 15-18 each add a real kind (a second counter, sight, reach,
 * a temporary/permanent distinction) with whatever fields that kind actually
 * needs — guessing those shapes now would be doing those items' design work
 * early, for a shape likely to be wrong anyway, exactly the reasoning item
 * 8's header used for `Tile` before items 9-13 gave it real kinds.
 *
 * `'placeholder'` exists solely to prove the substrate works — an item can be
 * carried in an expedition's inventory and flow through `applyItemEffects`
 * without disturbing anything — the same role `'marker'` played for the tile
 * layer before item 9 gave it a real effect. Unlike a tile, an item has
 * nothing to render on the board (it lives in the inventory, not on a cell),
 * so there is no equivalent of item 8's badge-placement problem here.
 *
 * Per the pre-declared decision table, "Items are tools that change rules
 * (sight, movement, counting), not stacked score multipliers" — so unlike
 * `applyTileEffects` (`scoring.ts`), which post-processes a placement's
 * *score*, `applyItemEffects` produces the effective `Config` a room's
 * legality and scoring run under. That is the natural shape for item 15
 * ("grants a counting method... using item 2's machinery" — i.e. it would
 * set `secondLensId`) and leaves room for 16-17 to extend the same switch
 * with their own `Config` fields once they exist, rather than inventing a
 * second hook. No kind does anything yet, so this item's version of the
 * function is the identity transform.
 *
 * Item 15: `'secondCounter'` is the first real kind, and it needed no new
 * machinery beyond `Config.secondLensId` — item 2's own field for "an active
 * counter set rather than one lens". `applyItemEffects` just writes the
 * item's `lensId` into `secondLensId`; `getScoringLens` (already called by
 * every scoring site downstream of `applyItemEffects`) does the actual
 * combining, exactly as it already does for a ruleset that ships a combo
 * from the start (`combo-cribbage-poker`). Mirrors `setup.ts`'s own
 * `normalise` rule — a second counter identical to the primary one would
 * just double-count a line for no reason — by leaving `cfg` untouched
 * (same reference) rather than writing a `secondLensId` equal to `lensId`.
 *
 * Item 16: `'sight'` picks the "reveal this room's hidden tiles" half of the
 * backlog item's "or" (the other half — see the next room's shape — is a
 * different mechanic with nothing to reuse here; left for whichever later
 * item wants it). A trap (item 12) is the only tile kind with hidden state,
 * so in practice this means traps. Unlike `secondCounter`, sight has no
 * `Config` field to write — legality and scoring are completely unaffected
 * by whether a trap has been *seen*, only by whether it has *sprung*
 * (`ExpeditionState.revealedTraps`, still the only thing `placeInRoom` reads
 * to decide that) — so `applyItemEffects`'s `'sight'` arm is the identity
 * transform, same as `'placeholder'`. The actual effect is a rendering-only
 * union computed in `expedition.ts`'s `visibleTraps`, which combines
 * `revealedTraps` with every trap in the current room when `hasSightItem`
 * is true. That split is the whole point: "changes decisions without
 * touching score" means a sight-revealed trap must still cost a card the
 * first time a placement actually lands on or beside it — sight only ever
 * changes what you can *see*, never what a placement *does*.
 */
import { getLens, type LensId } from '../lens';
import type { Config } from '../config';

export type Item =
  | { kind: 'placeholder'; label: string }
  | { kind: 'secondCounter'; lensId: LensId }
  | { kind: 'sight' };

/** The short text an item shows in the inventory list. */
export function itemLabel(item: Item): string {
  switch (item.kind) {
    case 'placeholder':
      return item.label;
    case 'secondCounter':
      return `${getLens(item.lensId).name} (2nd counter)`;
    case 'sight':
      return 'Sight (reveals traps)';
  }
}

/** True if the inventory carries a sight item (item 16) — the one fact
 * `expedition.ts`'s `visibleTraps` needs to decide whether to reveal every
 * trap in the current room ahead of it springing. */
export function hasSightItem(items: readonly Item[]): boolean {
  return items.some((item) => item.kind === 'sight');
}

/**
 * The one place an item's effect on the room's rules is applied: given the
 * expedition's current inventory, returns the `Config` actually in force for
 * this room's legality checks and scoring. Called from every site in
 * `expedition.ts` that currently takes a bare `cfg`, so a later item's real
 * effect lands in every one of those call sites automatically rather than
 * needing its own new wiring.
 */
export function applyItemEffects(cfg: Config, items: readonly Item[]): Config {
  return items.reduce((acc, item) => {
    switch (item.kind) {
      case 'placeholder':
        return acc;
      case 'secondCounter':
        return item.lensId === acc.lensId ? acc : { ...acc, secondLensId: item.lensId };
      case 'sight':
        return acc;
    }
  }, cfg);
}
