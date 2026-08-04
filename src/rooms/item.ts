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
 */
import type { Config } from '../config';

export type Item = { kind: 'placeholder'; label: string };

/** The short text an item shows in the inventory list. */
export function itemLabel(item: Item): string {
  switch (item.kind) {
    case 'placeholder':
      return item.label;
  }
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
    }
  }, cfg);
}
