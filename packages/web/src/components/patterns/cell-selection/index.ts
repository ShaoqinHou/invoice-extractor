export type { CellCoord, SelectionState, NormalizedRange } from "./types";
export {
  normalizeRange,
  isCellInRange,
  isMultiCellSelection,
  rangeToCopyText,
  getCellCoordsFromElement,
  DATA_ATTR_ROW,
  DATA_ATTR_COL,
} from "./utils";
export { useCellSelection } from "./useCellSelection";
