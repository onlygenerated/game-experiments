export type LinePunchAxis = 'row' | 'col';

/** A line-complete punctuation event: cells of the run that just reached the
 *  cap, each tagged with the axis whose cap it was. Keyed so back-to-back
 *  completions on the same line still remount and replay. */
export interface LinePunch {
  id: number;
  cells: ReadonlyMap<string, LinePunchAxis>;
}
