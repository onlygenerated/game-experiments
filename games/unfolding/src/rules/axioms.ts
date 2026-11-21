/**
 * Phase 3's axiom families (ROADMAP.md §1.4): Shape of Space (M-20) and Flow
 * of Time (M-24). Like harm.ts, behaviour only; every word is the premise's.
 *
 *  - rooms:   rooms and corridors (everything before Phase 3).
 *  - caverns: open caves, no doors. Under Halls the pocket you start in
 *             opens into the whole cave. Layout lives in dungeon.ts.
 *  - drift:   rooms and corridors, but every so often the rooms you aren't
 *             in change places and the corridors reroute. The stairs, the
 *             shrine and the room you stand in stay put.
 *  - turns:   time is only turns.
 *  - tide:    every floor keeps a clock once foes exist. At each stage the
 *             floor escalates: more foes, then every foe hunts you, then the
 *             floor itself hurts you until you leave.
 */
import { BALANCE as B } from '../engine/balance.ts';
import type { SpaceId, TimeId } from '../engine/types.ts';
import type { RuleHost } from './modules.ts';

export const SPACES: SpaceId[] = ['rooms', 'caverns', 'drift'];
export const TIMES: TimeId[] = ['turns', 'tide'];

export interface SpaceModule {
  id: SpaceId;
  /** Called once at the end of every turn. */
  onTurn?(host: RuleHost): void;
}

export const SPACE: Record<SpaceId, SpaceModule> = {
  rooms: { id: 'rooms' },
  caverns: { id: 'caverns' },
  drift: {
    id: 'drift',
    onTurn: (h) => {
      // A single room has nothing to rearrange; caves dug before Drift was settled stay caves.
      const f = h.run.floor;
      if (!h.ctx.rules.has('halls') || f.solo || f.caverns) return;
      const S = B.space;
      f.driftClock = (f.driftClock ?? 0) + 1;
      if (f.driftClock === S.driftEvery - S.driftWarn) h.log(h.lex.t('drift.soon'), 'dim', true);
      if (f.driftClock >= S.driftEvery) {
        f.driftClock = 0;
        h.shiftFloor();
      }
    },
  },
};

/** How many turns until this floor next rearranges itself. */
export function driftLeft(clock: number): number {
  return B.space.driftEvery - clock;
}

export interface TimeModule {
  id: TimeId;
  /** Called once at the end of every turn. */
  onTurn?(host: RuleHost): void;
}

/** How many turns until the floor's clock reaches its next stage (null once it has struck). */
export function tideLeft(clock: number): number | null {
  const next = B.time.tideStages.find((s) => s > clock);
  return next === undefined ? null : next - clock;
}

export const TIME: Record<TimeId, TimeModule> = {
  turns: { id: 'turns' },
  tide: {
    id: 'tide',
    onTurn: (h) => {
      // The clock has nothing to threaten until there is something to fear.
      if (!h.ctx.rules.has('peril')) return;
      const f = h.run.floor;
      const T = B.time;
      f.clock = (f.clock ?? 0) + 1;
      const stage = T.tideStages.filter((s) => f.clock! >= s).length;
      if (stage > (f.tide ?? 0)) {
        f.tide = stage;
        h.log(h.lex.t(`tide.${stage as 1 | 2 | 3}`), 'bad', true);
        if (stage === 1 || stage === 2) h.spawnFoes(T.tideFoes, T.tideFoesDistance);
        if (stage === 2) h.alertAll();
      }
      if (stage === 3 && (f.clock - T.tideStages[2]) % T.tideHurtEvery === T.tideHurtEvery - 1) {
        h.hurt(1, h.lex.t('tide.hurt'), h.lex.t('cause.tide', { n: h.run.depth }));
      }
    },
  },
};
