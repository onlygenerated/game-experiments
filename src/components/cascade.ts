import type { AxisRole } from '../lens';

/** One cell's turn in the line-scoring cascade: which axis it belongs to, and when it lights. */
export interface CascadeCell {
  role: AxisRole;
  delay: number;
}

/** A cascade event, keyed so the same cell lighting twice in a row still remounts and replays. */
export interface Cascade {
  id: number;
  cells: ReadonlyMap<string, CascadeCell>;
}
