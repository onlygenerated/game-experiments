/**
 * Phase 3's axiom families (ROADMAP.md §1.4): Shape of Space (M-20) and Flow
 * of Time (M-24). Like harm.ts, behaviour only; every word is the premise's.
 *
 *  - rooms:   rooms and corridors (everything before Phase 3).
 *  - caverns: open caves, no doors. Under Halls the pocket you start in
 *             opens into the whole cave. Layout lives in dungeon.ts.
 *  - turns:   time is only turns.
 *  - tide:    every floor keeps a clock once foes exist. At each stage the
 *             floor escalates: more foes, then every foe hunts you, then the
 *             floor itself hurts you until you leave.
 */
import { BALANCE as B } from '../engine/balance.ts';
import type { SpaceId, TimeId } from '../engine/types.ts';
import type { RuleHost } from './modules.ts';

export const SPACES: SpaceId[] = ['rooms', 'caverns'];
export const TIMES: TimeId[] = ['turns', 'tide'];

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
