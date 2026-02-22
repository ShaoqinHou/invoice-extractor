import type { CellCoord, NormalizedRange, SelectionState } from "./types";

/** Data attribute names placed on <td>/<th> elements for cell identification. */
export const DATA_ATTR_ROW = "data-cell-row";
export const DATA_ATTR_COL = "data-cell-col";

/** Normalize a selection so start <= end on both axes. */
export function normalizeRange(sel: SelectionState): NormalizedRange {
  return {
    startRow: Math.min(sel.anchor.row, sel.focus.row),
    startCol: Math.min(sel.anchor.col, sel.focus.col),
    endRow: Math.max(sel.anchor.row, sel.focus.row),
    endCol: Math.max(sel.anchor.col, sel.focus.col),
  };
}

/** Check if a cell at (row, col) falls within the normalized range. */
export function isCellInRange(
  row: number,
  col: number,
  range: NormalizedRange,
): boolean {
  return (
    row >= range.startRow &&
    row <= range.endRow &&
    col >= range.startCol &&
    col <= range.endCol
  );
}

/** True when anchor and focus are different cells (multi-cell selection). */
export function isMultiCellSelection(sel: SelectionState): boolean {
  return sel.anchor.row !== sel.focus.row || sel.anchor.col !== sel.focus.col;
}

/**
 * Build a TSV string from a rectangular selection range.
 * `getCellValue(row, col)` is the caller-provided data accessor.
 */
export function rangeToCopyText(
  range: NormalizedRange,
  getCellValue: (row: number, col: number) => string,
): string {
  const lines: string[] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const cells: string[] = [];
    for (let c = range.startCol; c <= range.endCol; c++) {
      cells.push(getCellValue(r, c));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/**
 * Extract CellCoord from a DOM element by reading data-cell-row / data-cell-col.
 * Walks up the DOM tree to find the closest element with those attributes.
 */
export function getCellCoordsFromElement(el: Element): CellCoord | null {
  const cell = el.closest(`[${DATA_ATTR_ROW}]`);
  if (!cell) return null;
  const row = cell.getAttribute(DATA_ATTR_ROW);
  const col = cell.getAttribute(DATA_ATTR_COL);
  if (row == null || col == null) return null;
  return { row: parseInt(row, 10), col: parseInt(col, 10) };
}
