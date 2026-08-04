/**
 * Item 8: the tile layer. `HexBoard` already keys cards by `"q,r"`
 * (`hex/board.ts`); tiles are a second sparse map with the same keys rather
 * than a change to that type, so every existing hex/board function keeps
 * working untouched — exactly the "second map, same keys" shape
 * ROOMS.md's architecture section calls for.
 *
 * `Tile` is deliberately a union of one placeholder member right now.
 * Items 9-13 each add a real kind (a card-multiplier bonus, a line-multiplier
 * bonus, a blocked cell, a trap, an artifact card) with whatever fields that
 * kind actually needs — guessing those field shapes here would be doing
 * those items' design work early, for nothing. `'marker'` exists solely to
 * prove the substrate: a tile can be stored, retrieved, and rendered under a
 * placed card without disappearing. No code anywhere reads a tile to change
 * legality or scoring yet — that is what "no effects yet" means.
 */
import { hexKey, type Hex } from '../hex/coords';

export type Tile = { kind: 'marker'; label: string };

export type TileMap = ReadonlyMap<string, Tile>;

export const emptyTileMap = (): TileMap => new Map();

export function tileAt(tiles: TileMap, h: Hex): Tile | undefined {
  return tiles.get(hexKey(h));
}

export const isTiled = (tiles: TileMap, h: Hex): boolean => tiles.has(hexKey(h));

/** Pure: returns a new map with `tile` written at `h`, same pattern as `withHexCard`. */
export function withTile(tiles: TileMap, h: Hex, tile: Tile): TileMap {
  const next = new Map(tiles);
  next.set(hexKey(h), tile);
  return next;
}

/** Builds a `TileMap` from a list of (coordinate, tile) pairs, e.g. for `makeRoom`. */
export function tileMapFrom(entries: readonly (readonly [Hex, Tile])[]): TileMap {
  const tiles = new Map<string, Tile>();
  for (const [h, tile] of entries) tiles.set(hexKey(h), tile);
  return tiles;
}
