/**
 * Item 21: a room graph — more than one exit can lead to a genuinely
 * different next room, rather than every exit funnelling into whatever
 * happened to come next in a flat list. `ExpeditionState.rooms` (`expedition.ts`)
 * already addresses every room in play by its index in that array; a
 * `RoomGraph` reuses that exact addressing rather than inventing a second
 * one (room ids, say) — a node is just "index into this expedition's own
 * `rooms`", so a `RoomGraph` never needs to be kept in sync with a separate
 * room registry.
 *
 * This is deliberately additive. `ExpeditionState.graph` is optional, and
 * `leaveRoom` falls back to its original "advance to `roomIndex + 1`,
 * complete once that runs past the end" behaviour whenever it's absent —
 * that fallback is what keeps every one of the roughly 60 pre-item-21
 * `newExpedition`/`leaveRoom` call sites across `expedition.test.ts`,
 * `room.test.ts` and `tools/probe.test.ts` passing with zero changes, and
 * what keeps the two graph-less dev flows (`ARCHETYPE_ROOMS`, a single
 * generated room) behaving exactly as items 19-20 built them. A room graph
 * was worth building without rewriting the addressing scheme every existing
 * test already relies on.
 *
 * A route only exists where one is declared: `makeRoomGraph` validates every
 * edge's exit hex is actually one of its source room's own exits (`isExit`),
 * throwing at graph-construction time on a typo'd coordinate rather than
 * silently doing nothing the first time a player reaches that door — the
 * same "fail loud at construction, not at play" convention `makeRoom`
 * itself already uses for exits and tiles. A room with no outgoing routes
 * at all (every hand-authored room shipped before this item, and any exit
 * deliberately left unrouted) is a leaf: leaving through any of its exits
 * completes the expedition, exactly the "ran off the end of the list" case
 * a flat sequence's last room already was.
 */
import { hexKey, type Hex } from '../hex/coords';
import { isExit, type Room } from './room';

export interface RoomGraphEdge {
  /** Index into the expedition's `rooms` array this edge starts from. */
  from: number;
  /** Which of that room's own exits this edge leaves through. */
  exit: Hex;
  /** Index into `rooms` this edge leads to. */
  to: number;
}

/** roomIndex -> (exit hex key -> destination roomIndex). Read-only once built. */
export type RoomGraph = ReadonlyMap<number, ReadonlyMap<string, number>>;

/**
 * Builds a validated `RoomGraph` over `rooms` (indices into that same
 * array). Throws immediately — not on first use — if an edge names a room
 * index out of range, an exit that isn't actually one of its source room's
 * exits, or the same exit twice.
 */
export function makeRoomGraph(rooms: readonly Room[], edges: readonly RoomGraphEdge[]): RoomGraph {
  const routes = new Map<number, Map<string, number>>();

  for (const { from, exit, to } of edges) {
    const source = rooms[from];
    if (!source) throw new Error(`room graph: no room at index ${from}`);
    if (!rooms[to]) throw new Error(`room graph: no room at index ${to}`);
    if (!isExit(source, exit)) {
      throw new Error(`room graph: ${hexKey(exit)} is not one of "${source.name}"'s exits`);
    }

    const key = hexKey(exit);
    const forRoom = routes.get(from) ?? new Map<string, number>();
    if (forRoom.has(key)) {
      throw new Error(`room graph: exit ${key} of "${source.name}" is already routed`);
    }
    forRoom.set(key, to);
    routes.set(from, forRoom);
  }

  return routes;
}
