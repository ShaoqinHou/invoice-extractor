import { describe, it, expect } from "vitest";
import {
  normalizeRange,
  isCellInRange,
  isMultiCellSelection,
  rangeToCopyText,
  getCellCoordsFromElement,
  DATA_ATTR_ROW,
  DATA_ATTR_COL,
} from "../utils";

describe("normalizeRange", () => {
  it("keeps already-normalized range unchanged", () => {
    const result = normalizeRange({
      anchor: { row: 0, col: 1 },
      focus: { row: 2, col: 3 },
    });
    expect(result).toEqual({ startRow: 0, startCol: 1, endRow: 2, endCol: 3 });
  });

  it("swaps when anchor is after focus", () => {
    const result = normalizeRange({
      anchor: { row: 2, col: 3 },
      focus: { row: 0, col: 1 },
    });
    expect(result).toEqual({ startRow: 0, startCol: 1, endRow: 2, endCol: 3 });
  });

  it("handles mixed ordering (row before, col after)", () => {
    const result = normalizeRange({
      anchor: { row: 0, col: 3 },
      focus: { row: 2, col: 1 },
    });
    expect(result).toEqual({ startRow: 0, startCol: 1, endRow: 2, endCol: 3 });
  });

  it("handles single cell (anchor === focus)", () => {
    const result = normalizeRange({
      anchor: { row: 1, col: 1 },
      focus: { row: 1, col: 1 },
    });
    expect(result).toEqual({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 });
  });

  it("handles header row (row -1)", () => {
    const result = normalizeRange({
      anchor: { row: 2, col: 0 },
      focus: { row: -1, col: 2 },
    });
    expect(result).toEqual({ startRow: -1, startCol: 0, endRow: 2, endCol: 2 });
  });
});

describe("isCellInRange", () => {
  const range = { startRow: 1, startCol: 1, endRow: 3, endCol: 4 };

  it("returns true for cell inside range", () => {
    expect(isCellInRange(2, 2, range)).toBe(true);
  });

  it("returns true for cell on range edge", () => {
    expect(isCellInRange(1, 1, range)).toBe(true);
    expect(isCellInRange(3, 4, range)).toBe(true);
    expect(isCellInRange(1, 4, range)).toBe(true);
    expect(isCellInRange(3, 1, range)).toBe(true);
  });

  it("returns false for cell outside range", () => {
    expect(isCellInRange(0, 0, range)).toBe(false);
    expect(isCellInRange(4, 2, range)).toBe(false);
    expect(isCellInRange(2, 5, range)).toBe(false);
    expect(isCellInRange(2, 0, range)).toBe(false);
  });
});

describe("isMultiCellSelection", () => {
  it("returns false when anchor equals focus", () => {
    expect(
      isMultiCellSelection({
        anchor: { row: 1, col: 2 },
        focus: { row: 1, col: 2 },
      }),
    ).toBe(false);
  });

  it("returns true when rows differ", () => {
    expect(
      isMultiCellSelection({
        anchor: { row: 0, col: 2 },
        focus: { row: 1, col: 2 },
      }),
    ).toBe(true);
  });

  it("returns true when cols differ", () => {
    expect(
      isMultiCellSelection({
        anchor: { row: 1, col: 0 },
        focus: { row: 1, col: 3 },
      }),
    ).toBe(true);
  });
});

describe("rangeToCopyText", () => {
  it("builds TSV from 2x3 range", () => {
    const getCellValue = (row: number, col: number) => `r${row}c${col}`;
    const result = rangeToCopyText(
      { startRow: 0, startCol: 0, endRow: 1, endCol: 2 },
      getCellValue,
    );
    expect(result).toBe("r0c0\tr0c1\tr0c2\nr1c0\tr1c1\tr1c2");
  });

  it("builds single cell", () => {
    const getCellValue = (_r: number, _c: number) => "hello";
    const result = rangeToCopyText(
      { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      getCellValue,
    );
    expect(result).toBe("hello");
  });

  it("includes header row when startRow is -1", () => {
    const getCellValue = (row: number, col: number) =>
      row === -1 ? `H${col}` : `D${row}C${col}`;
    const result = rangeToCopyText(
      { startRow: -1, startCol: 0, endRow: 1, endCol: 1 },
      getCellValue,
    );
    expect(result).toBe("H0\tH1\nD0C0\tD0C1\nD1C0\tD1C1");
  });
});

describe("getCellCoordsFromElement", () => {
  it("returns coords from element with data attributes", () => {
    const el = document.createElement("td");
    el.setAttribute(DATA_ATTR_ROW, "2");
    el.setAttribute(DATA_ATTR_COL, "3");
    expect(getCellCoordsFromElement(el)).toEqual({ row: 2, col: 3 });
  });

  it("walks up to parent with data attributes", () => {
    const td = document.createElement("td");
    td.setAttribute(DATA_ATTR_ROW, "1");
    td.setAttribute(DATA_ATTR_COL, "0");
    const input = document.createElement("input");
    td.appendChild(input);
    expect(getCellCoordsFromElement(input)).toEqual({ row: 1, col: 0 });
  });

  it("returns null when no data attributes found", () => {
    const el = document.createElement("div");
    expect(getCellCoordsFromElement(el)).toBeNull();
  });

  it("handles header row (row -1)", () => {
    const th = document.createElement("th");
    th.setAttribute(DATA_ATTR_ROW, "-1");
    th.setAttribute(DATA_ATTR_COL, "2");
    expect(getCellCoordsFromElement(th)).toEqual({ row: -1, col: 2 });
  });
});
