/** Cell coordinate within a table. row -1 = header row. */
export interface CellCoord {
  row: number;
  col: number;
}

/** Rectangular selection defined by anchor (start) and focus (current). */
export interface SelectionState {
  anchor: CellCoord;
  focus: CellCoord;
}

/** Normalized rectangular range with start <= end. */
export interface NormalizedRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}
