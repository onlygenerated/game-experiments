/** One cell's turn in the line-scoring cascade: when it lights. */
export interface CascadeCell {
  delay: number;
}

/** A cascade event, keyed so the same cell lighting twice in a row still remounts and replays. */
export interface Cascade {
  id: number;
  cells: ReadonlyMap<string, CascadeCell>;
}
