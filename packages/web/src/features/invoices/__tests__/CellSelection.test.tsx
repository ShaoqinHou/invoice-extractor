import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import {
  EditableEntriesTable,
  groupEntries,
  buildGlobalRowMap,
  computeEffectiveRange,
  crossSectionCopyText,
  buildGlobalCellValueGetter,
  getColCountForRow,
} from "../components/EditableEntriesTable";
import type { EntryRow, SelectionProps, SectionRowMap, HeaderFieldDef } from "../components/EditableEntriesTable";
import { DATA_ATTR_ROW, DATA_ATTR_COL, useCellSelection } from "@web/components/patterns/cell-selection";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";

const HEADER_FIELD_COUNT = 9;

const mockEntries: EntryRow[] = [
  { label: "Milk", amount: 3.5, entry_type: "charge", attrs: { unit: "ea", unit_amount: 2, unit_price: 1.75 } },
  { label: "Bread", amount: 2.0, entry_type: "charge", attrs: { unit: "loaf", unit_amount: 1, unit_price: 2.0 } },
  { label: "Tax", amount: 0.55, entry_type: "charge" },
];

function makeRowMap(entries: EntryRow[]): SectionRowMap {
  const { groups, summaryEntries } = groupEntries(entries);
  return buildGlobalRowMap(HEADER_FIELD_COUNT, groups, summaryEntries.length);
}

function makeSelectionProps(overrides?: Partial<SelectionProps>): SelectionProps {
  return {
    selection: null,
    range: null,
    isDragging: false,
    handleCellMouseDown: vi.fn(),
    clearSelection: vi.fn(),
    selectRange: vi.fn(),
    ...overrides,
  };
}

function setup(entries = mockEntries) {
  const onChange = vi.fn();
  const selectionProps = makeSelectionProps();
  const rowMap = makeRowMap(entries);
  const utils = render(
    <EditableEntriesTable
      entries={entries}
      onChange={onChange}
      selectionProps={selectionProps}
      rowMap={rowMap}
    />
  );
  return { ...utils, onChange, selectionProps, rowMap };
}

/** Find a <td> or <th> with specific cell coordinates */
function findCell(container: HTMLElement, row: number, col: number): HTMLElement | null {
  return container.querySelector(`[${DATA_ATTR_ROW}="${row}"][${DATA_ATTR_COL}="${col}"]`);
}

/** Check if an element has a class fragment */
function hasClassFragment(el: HTMLElement, fragment: string): boolean {
  return el.className.includes(fragment);
}

describe("CellSelection integration", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(""),
      },
    });
  });

  it("adds data-cell-row and data-cell-col attributes to group header cells with global row offsets", () => {
    const { container, rowMap } = setup();
    const headerRow = rowMap.groups[0].headerRow;
    const headerEntry = findCell(container, headerRow, 0);
    const headerAmount = findCell(container, headerRow, 1);
    expect(headerEntry).not.toBeNull();
    expect(headerAmount).not.toBeNull();
    expect(headerEntry?.tagName).toBe("TH");
    expect(headerAmount?.textContent).toContain("Amount");
  });

  it("adds data-cell-row and data-cell-col attributes to data cells with global row offsets", () => {
    const { container, rowMap } = setup();
    const dataStart = rowMap.groups[0].dataStart;
    const cell00 = findCell(container, dataStart, 0);
    const cell11 = findCell(container, dataStart + 1, 1);
    expect(cell00).not.toBeNull();
    expect(cell11).not.toBeNull();
    expect(cell00?.tagName).toBe("TD");
  });

  it("clicking a data cell calls handleCellMouseDown with global row coords", () => {
    const { container, selectionProps, rowMap } = setup();
    const dataStart = rowMap.groups[0].dataStart;
    const cell = findCell(container, dataStart, 0)!;
    fireEvent.mouseDown(cell, { shiftKey: false });
    expect(selectionProps.handleCellMouseDown).toHaveBeenCalledWith(dataStart, 0, false);
  });

  it("shift+click calls handleCellMouseDown with shift=true", () => {
    const { container, selectionProps, rowMap } = setup();
    const dataStart = rowMap.groups[0].dataStart;
    const cell = findCell(container, dataStart + 1, 2)!;
    fireEvent.mouseDown(cell, { shiftKey: true });
    expect(selectionProps.handleCellMouseDown).toHaveBeenCalledWith(dataStart + 1, 2, true);
  });

  it("renders selection highlight when range includes cells", () => {
    const entries = mockEntries;
    const rowMap = makeRowMap(entries);
    const dataStart = rowMap.groups[0].dataStart;
    const onChange = vi.fn();

    // Provide a selection range covering first two data rows, cols 0-1
    const selectionProps = makeSelectionProps({
      selection: {
        anchor: { row: dataStart, col: 0 },
        focus: { row: dataStart + 1, col: 1 },
      },
      range: {
        startRow: dataStart,
        startCol: 0,
        endRow: dataStart + 1,
        endCol: 1,
      },
    });

    const { container } = render(
      <EditableEntriesTable
        entries={entries}
        onChange={onChange}
        selectionProps={selectionProps}
        rowMap={rowMap}
      />
    );

    // All cells in the selection rectangle should have blue highlight
    const cell00 = findCell(container, dataStart, 0)!;
    const cell01 = findCell(container, dataStart, 1)!;
    const cell10 = findCell(container, dataStart + 1, 0)!;
    const cell11 = findCell(container, dataStart + 1, 1)!;

    expect(hasClassFragment(cell00, "blue")).toBe(true);
    expect(hasClassFragment(cell01, "blue")).toBe(true);
    expect(hasClassFragment(cell10, "blue")).toBe(true);
    expect(hasClassFragment(cell11, "blue")).toBe(true);
  });

  it("group header row highlights when in selection range", () => {
    const entries = mockEntries;
    const rowMap = makeRowMap(entries);
    const headerRow = rowMap.groups[0].headerRow;
    const dataStart = rowMap.groups[0].dataStart;
    const onChange = vi.fn();

    const selectionProps = makeSelectionProps({
      selection: {
        anchor: { row: headerRow, col: 0 },
        focus: { row: dataStart, col: 1 },
      },
      range: {
        startRow: headerRow,
        startCol: 0,
        endRow: dataStart,
        endCol: 1,
      },
    });

    const { container } = render(
      <EditableEntriesTable
        entries={entries}
        onChange={onChange}
        selectionProps={selectionProps}
        rowMap={rowMap}
      />
    );

    const headerCell = findCell(container, headerRow, 0)!;
    expect(hasClassFragment(headerCell, "blue")).toBe(true);
  });

  it("Copy All button copies all groups as TSV", () => {
    setup();

    const copyAllBtns = screen.getAllByTitle("Copy all groups as TSV");
    fireEvent.click(copyAllBtns[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const writtenText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(writtenText).toContain("Entry\tAmount");
    expect(writtenText).toContain("Milk");
    expect(writtenText).toContain("Bread");
  });

  it("selectRange is called with global coords when group tag is clicked", () => {
    const { container, selectionProps } = setup();

    // Click the group tag button (it should select the entire group)
    const groupTag = container.querySelector('button[title="Click to select group, double-click to rename"]')!;
    expect(groupTag).not.toBeNull();
    fireEvent.click(groupTag, { detail: 1 });

    expect(selectionProps.selectRange).toHaveBeenCalled();
    const args = (selectionProps.selectRange as ReturnType<typeof vi.fn>).mock.calls[0];
    // Should span from header row to last data row, col 0 to last col
    expect(args[0]).toBe(HEADER_FIELD_COUNT); // headerRow
    expect(args[1]).toBe(0); // startCol
    expect(args[2]).toBe(HEADER_FIELD_COUNT + mockEntries.length); // last data row
    expect(args[3]).toBe(4); // lastCol (Entry, Amount, Unit, Qty, Rate = 5 cols, lastCol = 4)
  });
});

describe("buildGlobalRowMap", () => {
  it("computes correct offsets for header + group + summary", () => {
    const entries: EntryRow[] = [
      { label: "Milk", amount: 3.5, entry_type: "charge" },
      { label: "Bread", amount: 2.0, entry_type: "charge" },
      { label: "Note", amount: null, entry_type: "info" },
      { label: "Subtotal", amount: 5.5, entry_type: "subtotal" },
    ];

    const { groups, summaryEntries } = groupEntries(entries);
    const map = buildGlobalRowMap(9, groups, summaryEntries.length);

    // Header: rows 0-8
    expect(map.headerCount).toBe(9);

    // Group "charge": headerRow=9, dataStart=10, dataCount=2
    expect(map.groups[0].type).toBe("charge");
    expect(map.groups[0].headerRow).toBe(9);
    expect(map.groups[0].dataStart).toBe(10);
    expect(map.groups[0].dataCount).toBe(2);

    // Group "info": headerRow=12, dataStart=13, dataCount=1
    expect(map.groups[1].type).toBe("info");
    expect(map.groups[1].headerRow).toBe(12);
    expect(map.groups[1].dataStart).toBe(13);
    expect(map.groups[1].dataCount).toBe(1);

    // Summary: starts at 14, count=1
    expect(map.summaryStart).toBe(14);
    expect(map.summaryCount).toBe(1);
    expect(map.totalRows).toBe(15);
  });
});

describe("computeEffectiveRange", () => {
  // Layout: header(9, 2cols), charge(3 data, 5cols), info(1 data, 2cols), summary(1, 3cols)
  const entries: EntryRow[] = [
    { label: "Milk", amount: 3.5, entry_type: "charge", attrs: { unit: "ea", unit_amount: 2, unit_price: 1.75 } },
    { label: "Bread", amount: 2.0, entry_type: "charge", attrs: { unit: "loaf", unit_amount: 1, unit_price: 2.0 } },
    { label: "Tax", amount: 0.55, entry_type: "charge" },
    { label: "Note", amount: null, entry_type: "info" },
    { label: "Subtotal", amount: 5.5, entry_type: "subtotal" },
  ];
  const { groups, summaryEntries } = groupEntries(entries);
  const map = buildGlobalRowMap(9, groups, summaryEntries.length);

  it("does not expand range when endCol is NOT at the right edge", () => {
    const range = { startRow: 0, startCol: 0, endRow: 10, endCol: 1 };
    // Row 10 is in the charge group (dataStart=10), charge has 5 cols (maxCol=4)
    // endCol=1 < 4, so no expansion
    const effective = computeEffectiveRange(range, map);
    expect(effective.endCol).toBe(1);
  });

  it("expands endCol to MAX when endCol reaches right edge of end section", () => {
    // endRow in charge data (row 10), charge maxCol=4, endCol=4 → at right edge
    const range = { startRow: 0, startCol: 0, endRow: 10, endCol: 4 };
    const effective = computeEffectiveRange(range, map);
    expect(effective.endCol).toBe(Number.MAX_SAFE_INTEGER);
    expect(effective.startCol).toBe(0);
    expect(effective.startRow).toBe(0);
  });

  it("expands when selection ends in a narrow section (info: 2 cols)", () => {
    // endRow in info data (row 14, dataStart=13+1=14), info maxCol=1, endCol=1 → at right edge
    const infoDataRow = map.groups[1].dataStart; // first data row of info group
    const range = { startRow: 10, startCol: 0, endRow: infoDataRow, endCol: 1 };
    const effective = computeEffectiveRange(range, map);
    expect(effective.endCol).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("expands when selection ends in summary section (3 cols)", () => {
    // endRow in summary (row=map.summaryStart), summary maxCol=2, endCol=2 → at right edge
    const range = { startRow: 0, startCol: 0, endRow: map.summaryStart, endCol: 2 };
    const effective = computeEffectiveRange(range, map);
    expect(effective.endCol).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("expands when selection ends in header section (2 cols)", () => {
    // endRow=8 (last header row), header maxCol=1, endCol=1 → at right edge
    const range = { startRow: 0, startCol: 0, endRow: 8, endCol: 1 };
    const effective = computeEffectiveRange(range, map);
    expect(effective.endCol).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("crossSectionCopyText", () => {
  // Header(2cols) + charge(5cols: Entry,Amount,Unit,Qty,Rate) + summary(3cols)
  const entries: EntryRow[] = [
    { label: "Milk", amount: 3.5, entry_type: "charge", attrs: { unit: "ea", unit_amount: 2, unit_price: 1.75 } },
    { label: "Subtotal", amount: 3.5, entry_type: "subtotal" },
  ];
  const headerFields: HeaderFieldDef[] = [
    { label: "Display Name", value: "Test Invoice" },
    { label: "Supplier", value: "Acme" },
  ];
  const { groups, summaryEntries } = groupEntries(entries);
  // Use headerFieldCount=2 for simplicity
  const map = buildGlobalRowMap(2, groups, summaryEntries.length);
  const getValue = buildGlobalCellValueGetter(map, headerFields, groups, summaryEntries);

  it("copies all columns per section when selection reaches right edge", () => {
    // Header rows 0-1 (2 cols), charge header row 2 (5 cols), charge data row 3 (5 cols), summary row 4 (3 cols)
    // Select from (0, 0) to (4, 2) — summary maxCol=2, endCol=2 → at right edge
    const range = { startRow: 0, startCol: 0, endRow: map.summaryStart, endCol: 2 };
    const tsv = crossSectionCopyText(range, map, getValue);
    const lines = tsv.split("\n");

    // Header rows should have 2 columns
    expect(lines[0]).toBe("Display Name\tTest Invoice");
    expect(lines[1]).toBe("Supplier\tAcme");

    // Charge header row should have 5 columns
    expect(lines[2]).toBe("Entry\tAmount\tUnit\tQty\tRate");

    // Charge data row should have 5 columns
    expect(lines[3]).toBe("Milk\t3.5\tea\t2\t1.75");

    // Summary row should have 3 columns
    expect(lines[4]).toBe("Subtotal\tsubtotal\t3.5");
  });

  it("copies only selected columns when not at right edge", () => {
    // Select columns 0-1 only in charge data (row 3)
    const chargeDataRow = map.groups[0].dataStart;
    const range = { startRow: chargeDataRow, startCol: 0, endRow: chargeDataRow, endCol: 1 };
    const tsv = crossSectionCopyText(range, map, getValue);
    expect(tsv).toBe("Milk\t3.5");
  });
});
