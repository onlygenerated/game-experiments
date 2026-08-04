/**
 * Item 9: bonus tiles that double or triple the placed card's own
 * contribution to every line through it — the Scrabble letter square.
 *
 * Deliberately built as a wrapper around `scoreHexPlacement` (`hex/board.ts`)
 * rather than a change to it: that function is shared with the existing hex
 * sprawl mode (`useRun.ts`, `hex/game.ts`), and ROOMS.md's standing rule is
 * "never break the existing game." A room-only concern like a tile effect
 * has no business touching code the old mode also runs through, so this
 * file post-processes the (unmodified) plain hex score instead.
 *
 * The harder design question was what "the placed card's own contribution to
 * a line" even means. Cribbage's count (fifteens, pairs, runs, flush) is
 * combinatorial across the whole line, not a sum of independent per-card
 * values, so there is no way to point at "this card's share" the way a
 * Scrabble letter's own point value is self-evident. The generic answer that
 * works for any `Lens` (cribbage, poker, or a combination of both, per item
 * 2) is a marginal-contribution definition: this card's contribution to a
 * line is the line's value *with* it, minus the line's value with it
 * removed and nothing else changed. That is exactly the quantity a doubling
 * tile should double — the amount this specific card added.
 */
import type { Card } from '../deck';
import {
  scoreHexPlacement,
  type HexBoard,
  type HexLineScore,
  type HexPlacementScore,
  type HexWindow,
} from '../hex/board';
import { hexKey, type Hex } from '../hex/coords';
import { getScoringLens, type Lens } from '../lens';
import { CONFIG, type Config } from '../config';
import { tileAt, type TileMap } from './tile';

/**
 * A card's marginal contribution to a scored slice of a line: the slice's
 * value with the card in it, minus its value with that one card removed.
 * Clamped at zero — a multiplier tile is a bonus, and a card that happens to
 * be dragging the line's value *down* (a real possibility once partial-hand
 * scaling is in play; see `poker.ts`) should never make a tile turn that
 * drag into a bigger loss.
 */
export function cardContribution(cards: readonly Card[], cardIndex: number, lens: Lens, cfg: Config): number {
  const withCard = lens.evaluate(cards, cfg).value;
  const without = lens.evaluate(cards.filter((_, i) => i !== cardIndex), cfg).value;
  return Math.max(0, withCard - without);
}

/**
 * Applies a `cardMultiplier` tile at `h`, if there is one, to every one of
 * the placement's (up to three) lines whose *scored window* actually
 * includes `h`. A long line's best window can fall away from the cell just
 * played (`bestWindow` in `hex/board.ts`), and a tile only boosts the card
 * that earned it — if this placement isn't part of what scored on a given
 * axis, that axis gets no bonus.
 */
export function applyTileEffects(
  base: HexPlacementScore,
  h: Hex,
  tiles: TileMap,
  lens: Lens,
  cfg: Config,
): HexPlacementScore {
  const tile = tileAt(tiles, h);
  if (!tile || tile.kind !== 'cardMultiplier') return base;

  const hKey = hexKey(h);
  let changed = false;

  const hexLines: HexLineScore[] = base.hexLines.map((line) => {
    const idx = line.window.coords.findIndex((c) => hexKey(c) === hKey);
    if (idx < 0) return line;

    const bonus = cardContribution(line.window.cards, idx, lens, cfg) * (tile.multiplier - 1);
    if (bonus <= 0) return line;

    changed = true;
    const window: HexWindow = {
      ...line.window,
      result: {
        ...line.window.result,
        items: [...line.window.result.items, { label: `Card ×${tile.multiplier} tile`, points: bonus }],
        value: line.window.result.value + bonus,
      },
    };
    return { ...line, window };
  });

  if (!changed) return base;

  const lines = base.lines.map((l, i) => ({
    ...l,
    result: hexLines[i].window.result,
    value: hexLines[i].window.result.value,
  }));

  const total = hexLines.reduce((sum, l) => sum + l.window.result.value, 0);

  return {
    ...base,
    hexLines,
    lines,
    score: Math.round(total * base.ringBonus),
  };
}

/** `scoreHexPlacement`, plus whatever the room's tile at `h` does to the result. */
export function scoreRoomPlacement(
  board: HexBoard,
  h: Hex,
  card: Card,
  tiles: TileMap,
  cfg: Config = CONFIG,
  lens: Lens = getScoringLens(cfg),
): HexPlacementScore {
  const base = scoreHexPlacement(board, h, card, cfg, lens);
  return applyTileEffects(base, h, tiles, lens, cfg);
}
