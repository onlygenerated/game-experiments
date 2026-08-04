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
 *
 * Item 17: `'reachAnchor'` picks "place one card unconnected" out of the
 * backlog item's own "or" — read as the same mechanic as "extend from a
 * second origin", not a separate one to also build: `hasHexNeighbor`
 * (`hex/board.ts`) tests adjacency against *any* occupied cell on the whole
 * board, not against one connected structure, so a single unconnected
 * placement is already, mechanically, a second origin the normal adjacency
 * rule will happily grow from afterward with no further help. `room.ts`'s
 * own header comment already anticipated this ("a structure need not be one
 * contiguous blob (free placement, item 17's alternate origins)") and
 * `structureReachesExit` already walks connected components rather than
 * assuming one blob, so reach was ready for this before this item existed.
 * Like sight, this has no `Config` field to write — it changes what a
 * placement is *allowed to be legal despite*, not a scoring or counting
 * rule — so `applyItemEffects`'s arm is the identity transform too; the real
 * effect is the adjacency bypass in `expedition.ts`'s `isLegalRoomPlacement`
 * plus the one-shot consumption in `placeInRoom`. Unlike `sight` or
 * `secondCounter`, this item is spent: `consumeReachAnchorItem` removes one
 * instance the moment a placement actually relies on it, matching "place
 * *one* card unconnected" literally rather than granting a standing rule
 * change for as long as it's carried.
 *
 * Item 18: every item shipped so far (15-17) turned out to last the whole
 * expedition — `secondCounter`/`sight` because their own decisions logs say
 * so explicitly, `reachAnchor` because nothing strips it at a room boundary,
 * only on use. So there is nothing in this codebase today that actually
 * *is* room-scoped, and item 14's own test ("survives a room transition —
 * ... inventory is not per-room") already pins "an item persists by
 * default" as tested, load-bearing behaviour that this item must not
 * relitigate. `duration` is therefore an *optional* field, defaulting to
 * `'expedition'` via `itemDuration` — every existing item literal in this
 * codebase and its tests compiles and behaves exactly as before, since none
 * of them set it. A `'room'` duration is new, real machinery (`leaveRoom` in
 * `expedition.ts` now strips it), not just a label — demonstrated with a
 * `'placeholder'` item carrying `duration: 'room'`, the same "no real
 * effect, proves the substrate" role `'placeholder'` has played since item
 * 14, rather than inventing a fifth kind with an actual rule/score effect
 * that section D's later items (19+) haven't asked for yet.
 */
import { getLens, type LensId } from '../lens';
import type { Config } from '../config';

export type ItemDuration = 'room' | 'expedition';

export type Item =
  | { kind: 'placeholder'; label: string; duration?: ItemDuration }
  | { kind: 'secondCounter'; lensId: LensId; duration?: ItemDuration }
  | { kind: 'sight'; duration?: ItemDuration }
  | { kind: 'reachAnchor'; duration?: ItemDuration };

/** How long an item lasts once carried — a whole expedition (the default,
 * matching every item kind's behaviour before item 18) or just the room it
 * was picked up in. `expedition.ts`'s `leaveRoom` is the one place this is
 * read to decide what to strip from the inventory on a room transition. */
export function itemDuration(item: Item): ItemDuration {
  return item.duration ?? 'expedition';
}

/** The short text an item shows in the inventory list — the kind-specific
 * description, plus a generic "(this room only)" tag for anything with
 * `duration: 'room'` so the temporary/permanent distinction (item 18) is
 * visible for any item kind, not just the one demonstrating it today. */
export function itemLabel(item: Item): string {
  const base = ((): string => {
    switch (item.kind) {
      case 'placeholder':
        return item.label;
      case 'secondCounter':
        return `${getLens(item.lensId).name} (2nd counter)`;
      case 'sight':
        return 'Sight (reveals traps)';
      case 'reachAnchor':
        return 'Reach anchor (place one card unconnected)';
    }
  })();
  return itemDuration(item) === 'room' ? `${base} (this room only)` : base;
}

/** True if the inventory carries a sight item (item 16) — the one fact
 * `expedition.ts`'s `visibleTraps` needs to decide whether to reveal every
 * trap in the current room ahead of it springing. */
export function hasSightItem(items: readonly Item[]): boolean {
  return items.some((item) => item.kind === 'sight');
}

/** True if the inventory carries an unspent reach-anchor charge (item 17) —
 * the one fact `expedition.ts`'s `isLegalRoomPlacement` needs to decide
 * whether to let a placement skip the adjacency requirement. */
export function hasReachAnchorItem(items: readonly Item[]): boolean {
  return items.some((item) => item.kind === 'reachAnchor');
}

/**
 * Removes one `'reachAnchor'` charge (the first one found) from an
 * inventory, spending it. A no-op (returns an equal-but-new array) if none
 * is carried — callers that need to guard against spending a charge that
 * isn't there should check `hasReachAnchorItem` first, the same way
 * `placeInRoom` does before calling this.
 */
export function consumeReachAnchorItem(items: readonly Item[]): Item[] {
  const idx = items.findIndex((item) => item.kind === 'reachAnchor');
  if (idx === -1) return [...items];
  return [...items.slice(0, idx), ...items.slice(idx + 1)];
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
      case 'reachAnchor':
        return acc;
    }
  }, cfg);
}
