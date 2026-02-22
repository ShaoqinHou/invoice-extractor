import { useState, useRef, useCallback } from "react";
import {
  isCellInRange,
  isMultiCellSelection,
  DATA_ATTR_ROW,
  DATA_ATTR_COL,
} from "@web/components/patterns/cell-selection";
import type { SelectionState, NormalizedRange } from "@web/components/patterns/cell-selection";

export interface EntryRow {
  id?: number;
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs?: Record<string, unknown> | null;
}

/** Selection props passed down from the parent (ReviewForm) */
export interface SelectionProps {
  selection: SelectionState | null;
  range: NormalizedRange | null;
  isDragging: boolean;
  handleCellMouseDown: (row: number, col: number, shiftKey: boolean) => void;
  clearSelection: () => void;
  selectRange: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
}

interface EditableEntriesTableProps {
  entries: EntryRow[];
  onChange: (entries: EntryRow[]) => void;
  /** Selection props from parent ReviewForm */
  selectionProps: SelectionProps;
  /** Global row map */
  rowMap: SectionRowMap;
}

const SUMMARY_TYPES = new Set(["subtotal", "total", "due", "tax", "discount", "adjustment"]);
const ENTRY_TYPES = ["charge", "discount", "tax", "subtotal", "total", "due", "adjustment", "info"];

/** Fixed columns in display order */
const FIXED_ATTRS = ["unit", "unit_amount", "unit_price"] as const;
const FIXED_LABELS: Record<string, string> = {
  unit: "Unit",
  unit_amount: "Qty",
  unit_price: "Rate",
};

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface AttrColumn {
  key: string;
  label: string;
}

/** Build ordered column list: fixed columns first, then extras with labels, then legacy */
function buildAttrColumns(entries: { entry: EntryRow }[]): AttrColumn[] {
  const columns: AttrColumn[] = [];
  const hasKey = new Set<string>();

  for (const { entry } of entries) {
    const attrs = entry.attrs ?? {};
    for (const key of Object.keys(attrs)) {
      if (attrs[key] != null && attrs[key] !== "") hasKey.add(key);
    }
  }

  // Fixed columns in order
  for (const key of FIXED_ATTRS) {
    if (hasKey.has(key)) {
      columns.push({ key, label: FIXED_LABELS[key] });
    }
  }

  // Extra columns (extra1, extra2, ...) using their labels
  const extraNums: number[] = [];
  for (const key of hasKey) {
    const match = key.match(/^extra(\d+)$/);
    if (match) extraNums.push(parseInt(match[1], 10));
  }
  extraNums.sort((a, b) => a - b);

  for (const n of extraNums) {
    let label = `Extra ${n}`;
    for (const { entry } of entries) {
      const l = entry.attrs?.[`extra${n}_label`];
      if (typeof l === "string" && l) { label = l; break; }
    }
    columns.push({ key: `extra${n}`, label });
  }

  // Legacy keys (not fixed, not extraN, not _label)
  const usedKeys = new Set<string>([...FIXED_ATTRS, ...extraNums.flatMap(n => [`extra${n}`, `extra${n}_label`])]);
  const legacyKeys: string[] = [];
  for (const key of hasKey) {
    if (!usedKeys.has(key) && !key.endsWith("_label")) {
      legacyKeys.push(key);
    }
  }
  legacyKeys.sort();
  for (const key of legacyKeys) {
    columns.push({ key, label: titleCase(key) });
  }

  return columns;
}

export interface EntryGroup {
  type: string;
  entries: { entry: EntryRow; globalIndex: number }[];
  columns: AttrColumn[];
}

export function groupEntries(entries: EntryRow[]): { groups: EntryGroup[]; summaryEntries: { entry: EntryRow; globalIndex: number }[] } {
  const groupMap = new Map<string, { entry: EntryRow; globalIndex: number }[]>();
  const order: string[] = [];
  const summaryEntries: { entry: EntryRow; globalIndex: number }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const type = entry.entry_type ?? "other";
    if (SUMMARY_TYPES.has(type)) {
      summaryEntries.push({ entry, globalIndex: i });
      continue;
    }
    if (!groupMap.has(type)) {
      groupMap.set(type, []);
      order.push(type);
    }
    groupMap.get(type)!.push({ entry, globalIndex: i });
  }

  const groups: EntryGroup[] = order.map(type => {
    const groupEntries = groupMap.get(type)!;
    const columns = buildAttrColumns(groupEntries);
    return { type, entries: groupEntries, columns };
  });

  return { groups, summaryEntries };
}

function formatAttrValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toString();
  return String(value);
}

/* ------------------------------------------------------------------ */
/*  Global row map (for cross-section selection)                      */
/* ------------------------------------------------------------------ */

export interface SectionRowMap {
  headerStart: number;     // always 0
  headerCount: number;     // number of header fields
  groups: {
    type: string;
    headerRow: number;     // global row of the group's column header
    dataStart: number;     // global row of first data entry
    dataCount: number;     // number of data entries
    colCount: number;      // 2 + attrColumns.length
  }[];
  summaryStart: number;
  summaryCount: number;
  totalRows: number;
}

/** Build a global row map from the current data layout. */
export function buildGlobalRowMap(
  headerFieldCount: number,
  groups: EntryGroup[],
  summaryCount: number,
): SectionRowMap {
  let cursor = headerFieldCount;

  const groupMaps = groups.map(g => {
    const headerRow = cursor;
    const dataStart = cursor + 1;
    const dataCount = g.entries.length;
    const colCount = 2 + g.columns.length;
    cursor = dataStart + dataCount;
    return { type: g.type, headerRow, dataStart, dataCount, colCount };
  });

  const summaryStart = cursor;

  return {
    headerStart: 0,
    headerCount: headerFieldCount,
    groups: groupMaps,
    summaryStart,
    summaryCount,
    totalRows: cursor + summaryCount,
  };
}

/** Header field definitions for the selectable header table */
export interface HeaderFieldDef {
  label: string;
  value: string;
}

/**
 * Build a function that maps (globalRow, col) → display string,
 * suitable for the rangeToCopyText callback across all sections.
 */
export function buildGlobalCellValueGetter(
  map: SectionRowMap,
  headerFields: HeaderFieldDef[],
  groups: EntryGroup[],
  summaryEntries: { entry: EntryRow; globalIndex: number }[],
): (row: number, col: number) => string {
  return (row: number, col: number): string => {
    // Header fields section (2 cols: label, value)
    if (row < map.headerCount) {
      const field = headerFields[row];
      if (!field) return "";
      if (col === 0) return field.label;
      if (col === 1) return field.value;
      return "";
    }

    // Group sections
    for (let gi = 0; gi < map.groups.length; gi++) {
      const gm = map.groups[gi];
      const group = groups[gi];
      if (row === gm.headerRow) {
        // Group column header row
        return getHeaderLabel(col, group.columns);
      }
      if (row >= gm.dataStart && row < gm.dataStart + gm.dataCount) {
        const localRow = row - gm.dataStart;
        const entry = group.entries[localRow];
        if (!entry) return "";
        return getCellValue(entry.entry, col, group.columns);
      }
    }

    // Summary section (3 cols: label, type, amount)
    if (row >= map.summaryStart && row < map.summaryStart + map.summaryCount) {
      const si = row - map.summaryStart;
      const se = summaryEntries[si];
      if (!se) return "";
      if (col === 0) return se.entry.label;
      if (col === 1) return se.entry.entry_type ?? "";
      if (col === 2) return se.entry.amount != null ? String(se.entry.amount) : "";
      return "";
    }

    return "";
  };
}

/**
 * Get the column count for the section that a given global row belongs to.
 */
export function getColCountForRow(row: number, map: SectionRowMap): number {
  if (row < map.headerCount) return 2;
  for (const gm of map.groups) {
    if (row === gm.headerRow || (row >= gm.dataStart && row < gm.dataStart + gm.dataCount)) {
      return gm.colCount;
    }
  }
  if (row >= map.summaryStart && row < map.summaryStart + map.summaryCount) return 3;
  return 1;
}

/**
 * Compute an effective selection range that accounts for cross-section column alignment.
 *
 * All section tables are full-width, so the rightmost column of a narrow section
 * is visually aligned with the rightmost column of a wider section. When the selection's
 * endCol reaches the right edge of the section containing endRow, we expand endCol to
 * MAX_SAFE_INTEGER so all columns of wider sections are also selected.
 *
 * This is safe because `isCellInRange` is only called for cells that actually exist in
 * the DOM — nonexistent columns beyond a section's max are never checked.
 */
export function computeEffectiveRange(
  range: NormalizedRange,
  rowMap: SectionRowMap,
): NormalizedRange {
  const endSectionMaxCol = getColCountForRow(range.endRow, rowMap) - 1;
  const atRightEdge = range.endCol >= endSectionMaxCol;

  if (!atRightEdge) return range;

  return {
    startRow: range.startRow,
    startCol: range.startCol,
    endRow: range.endRow,
    endCol: Number.MAX_SAFE_INTEGER,
  };
}

/**
 * Build a TSV copy string for a cross-section selection.
 * Unlike generic `rangeToCopyText`, this clamps each row's column range
 * to the section's actual column count (so we don't emit huge trailing tabs).
 */
export function crossSectionCopyText(
  range: NormalizedRange,
  rowMap: SectionRowMap,
  getCellValue: (row: number, col: number) => string,
): string {
  const endSectionMaxCol = getColCountForRow(range.endRow, rowMap) - 1;
  const expandRight = range.endCol >= endSectionMaxCol;

  const lines: string[] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    const rowMaxCol = getColCountForRow(r, rowMap) - 1;
    const effectiveEndCol = expandRight ? rowMaxCol : Math.min(range.endCol, rowMaxCol);
    const effectiveStartCol = Math.min(range.startCol, rowMaxCol);
    if (effectiveStartCol > effectiveEndCol) {
      lines.push("");
      continue;
    }
    const cells: string[] = [];
    for (let c = effectiveStartCol; c <= effectiveEndCol; c++) {
      cells.push(getCellValue(r, c));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Cell value helpers (exported for testing)                         */
/* ------------------------------------------------------------------ */

/**
 * Get the display value of a cell at the given row/col within a group.
 * col 0 = label, col 1 = amount, col 2+ = attrs columns in order.
 */
export function getCellValue(
  entry: EntryRow,
  col: number,
  columns: AttrColumn[],
): string {
  if (col === 0) return entry.label;
  if (col === 1) return entry.amount != null ? String(entry.amount) : "";
  const attrCol = columns[col - 2];
  if (!attrCol) return "";
  return formatAttrValue(entry.attrs?.[attrCol.key]);
}

/** Header labels for columns: col 0 = "Entry", col 1 = "Amount", col 2+ = attr label */
function getHeaderLabel(col: number, columns: AttrColumn[]): string {
  if (col === 0) return "Entry";
  if (col === 1) return "Amount";
  const attrCol = columns[col - 2];
  return attrCol ? attrCol.label : "";
}

/**
 * Build a TSV (tab-separated values) string for an entire group table.
 * First row is the header, subsequent rows are entry values.
 */
export function groupToTsv(
  groupEntries: { entry: EntryRow; globalIndex: number }[],
  columns: AttrColumn[],
): string {
  const headerCells = ["Entry", "Amount", ...columns.map(c => c.label)];
  const lines: string[] = [headerCells.join("\t")];
  for (const { entry } of groupEntries) {
    const totalCols = 2 + columns.length;
    const cells: string[] = [];
    for (let c = 0; c < totalCols; c++) {
      cells.push(getCellValue(entry, c, columns));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/**
 * Detect whether clipboard text is TSV (contains tab characters).
 */
export function isTsvText(text: string): boolean {
  return text.includes("\t");
}

/**
 * Parse a TSV string into a 2D array of strings.
 */
export function parseTsv(text: string): string[][] {
  return text.split(/\r?\n/).filter(line => line.length > 0).map(line => line.split("\t"));
}

export function EditableEntriesTable({ entries, onChange, selectionProps, rowMap }: EditableEntriesTableProps) {
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [copyAllFeedback, setCopyAllFeedback] = useState(false);

  const { groups, summaryEntries } = groupEntries(entries);

  const { selection, range, isDragging, handleCellMouseDown, selectRange } = selectionProps;
  const hasMultiSelection = selection ? isMultiCellSelection(selection) : false;

  function updateEntry(globalIndex: number, field: keyof EntryRow, value: string) {
    const updated = [...entries];
    if (field === "amount") {
      updated[globalIndex] = { ...updated[globalIndex], amount: value === "" ? null : parseFloat(value) };
    } else {
      updated[globalIndex] = { ...updated[globalIndex], [field]: value || null };
    }
    onChange(updated);
  }

  function updateAttr(globalIndex: number, key: string, value: string) {
    const updated = [...entries];
    const current = updated[globalIndex].attrs ?? {};
    updated[globalIndex] = {
      ...updated[globalIndex],
      attrs: { ...current, [key]: value === "" ? null : (isNaN(Number(value)) ? value : Number(value)) },
    };
    onChange(updated);
  }

  function removeEntry(globalIndex: number) {
    onChange(entries.filter((_, i) => i !== globalIndex));
  }

  function addEntryToGroup(groupType: string) {
    const updated = [...entries];
    let lastIndex = -1;
    for (let i = 0; i < updated.length; i++) {
      if ((updated[i].entry_type ?? "other") === groupType) lastIndex = i;
    }
    const newEntry: EntryRow = { label: "", amount: null, entry_type: groupType };
    if (lastIndex >= 0) {
      updated.splice(lastIndex + 1, 0, newEntry);
    } else {
      let insertPos = updated.length;
      for (let i = 0; i < updated.length; i++) {
        if (SUMMARY_TYPES.has(updated[i].entry_type ?? "")) { insertPos = i; break; }
      }
      updated.splice(insertPos, 0, newEntry);
    }
    onChange(updated);
  }

  function addSummaryEntry() {
    onChange([...entries, { label: "", amount: null, entry_type: "subtotal" }]);
  }

  function addGroup() {
    const name = newGroupName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    const updated = [...entries];
    let insertPos = updated.length;
    for (let i = 0; i < updated.length; i++) {
      if (SUMMARY_TYPES.has(updated[i].entry_type ?? "")) { insertPos = i; break; }
    }
    updated.splice(insertPos, 0, { label: "", amount: null, entry_type: name });
    onChange(updated);
    setNewGroupName("");
    setShowAddGroup(false);
  }

  function renameGroup(oldType: string, newType: string) {
    const normalized = newType.trim().toLowerCase().replace(/\s+/g, "_");
    if (!normalized) return;
    onChange(entries.map(e => (e.entry_type ?? "other") === oldType ? { ...e, entry_type: normalized } : e));
  }

  /** Copy all groups as TSV, separated by blank lines */
  function handleCopyAll() {
    const tsvParts = groups.map(g => groupToTsv(g.entries, g.columns));
    const tsv = tsvParts.join("\n\n");
    navigator.clipboard.writeText(tsv).then(() => {
      setCopyAllFeedback(true);
      setTimeout(() => setCopyAllFeedback(false), 1500);
    });
  }

  /** Handle mousedown on a cell: manage shift+click vs normal click */
  const handleCellMouseDownEvent = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      if (e.shiftKey) {
        e.preventDefault();
        handleCellMouseDown(row, col, true);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      } else {
        handleCellMouseDown(row, col, false);
      }
    },
    [handleCellMouseDown],
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Entries</span>
        <div className="flex gap-1.5">
          {showAddGroup ? (
            <div className="flex items-center gap-1">
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addGroup()}
                placeholder="Group name..."
                className="w-28 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs"
                autoFocus
              />
              <button type="button" onClick={addGroup} className="rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100">Add</button>
              <button type="button" onClick={() => { setShowAddGroup(false); setNewGroupName(""); }} className="px-1 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
                title="Copy all groups as TSV"
              >
                <ClipboardIcon />
                {copyAllFeedback ? "Copied!" : "Copy All"}
              </button>
              <button type="button" onClick={() => setShowAddGroup(true)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100">+ Group</button>
              <button type="button" onClick={addSummaryEntry} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100">+ Summary</button>
            </>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-gray-400">No entries</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group, gi) => {
            const gm = rowMap.groups[gi];
            return (
              <GroupSection
                key={group.type}
                group={group}
                allEntries={entries}
                onUpdate={updateEntry}
                onUpdateAttr={updateAttr}
                onRemove={removeEntry}
                onAdd={() => addEntryToGroup(group.type)}
                onRename={(newName) => renameGroup(group.type, newName)}
                onBulkChange={onChange}
                selection={selection}
                range={range}
                isDragging={isDragging}
                hasMultiSelection={hasMultiSelection}
                handleCellMouseDownEvent={handleCellMouseDownEvent}
                selectRange={selectRange}
                globalHeaderRow={gm?.headerRow ?? 0}
                globalDataStart={gm?.dataStart ?? 0}
              />
            );
          })}

          {summaryEntries.length > 0 && (
            <div className="border-t-2 border-gray-300 pt-2">
              <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
                <tbody>
                  {summaryEntries.map(({ entry, globalIndex }, si) => {
                    const globalRow = rowMap.summaryStart + si;
                    return (
                      <tr key={globalIndex}>
                        {/* Label (col 0) */}
                        {(() => {
                          const inRange = range ? isCellInRange(globalRow, 0, range) : false;
                          const isAnchor = hasMultiSelection && selection?.anchor.row === globalRow && selection?.anchor.col === 0;
                          return (
                            <td
                              {...{ [DATA_ATTR_ROW]: globalRow, [DATA_ATTR_COL]: 0 }}
                              className={`border p-0 ${
                                isAnchor ? anchorCellClass
                                  : inRange && hasMultiSelection ? selectedCellClass
                                  : "border-gray-200"
                              }`}
                              onMouseDown={(e) => handleCellMouseDownEvent(e, globalRow, 0)}
                            >
                              <input
                                value={entry.label}
                                onChange={e => updateEntry(globalIndex, "label", e.target.value)}
                                placeholder="Label"
                                className={`${isAnchor ? anchorCellInputClass : inRange && hasMultiSelection ? selectedCellInputClass : cellInputClass} font-medium`}
                              />
                            </td>
                          );
                        })()}
                        {/* Type dropdown (col 1) */}
                        {(() => {
                          const inRange = range ? isCellInRange(globalRow, 1, range) : false;
                          const isAnchor = hasMultiSelection && selection?.anchor.row === globalRow && selection?.anchor.col === 1;
                          return (
                            <td
                              {...{ [DATA_ATTR_ROW]: globalRow, [DATA_ATTR_COL]: 1 }}
                              className={`border p-0 w-20 ${
                                isAnchor ? anchorCellClass
                                  : inRange && hasMultiSelection ? selectedCellClass
                                  : "border-gray-200"
                              }`}
                              onMouseDown={(e) => handleCellMouseDownEvent(e, globalRow, 1)}
                            >
                              <select
                                value={entry.entry_type ?? "subtotal"}
                                onChange={e => updateEntry(globalIndex, "entry_type", e.target.value)}
                                className={`${isAnchor ? "bg-transparent" : inRange && hasMultiSelection ? "bg-transparent" : "bg-white"} px-1 py-1 text-xs w-full outline-none border-0`}
                              >
                                {ENTRY_TYPES.filter(t => SUMMARY_TYPES.has(t)).map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                          );
                        })()}
                        {/* Amount (col 2) */}
                        {(() => {
                          const inRange = range ? isCellInRange(globalRow, 2, range) : false;
                          const isAnchor = hasMultiSelection && selection?.anchor.row === globalRow && selection?.anchor.col === 2;
                          return (
                            <td
                              {...{ [DATA_ATTR_ROW]: globalRow, [DATA_ATTR_COL]: 2 }}
                              className={`border p-0 w-24 ${
                                isAnchor ? anchorCellClass
                                  : inRange && hasMultiSelection ? selectedCellClass
                                  : "border-gray-200"
                              }`}
                              onMouseDown={(e) => handleCellMouseDownEvent(e, globalRow, 2)}
                            >
                              <input
                                type="number"
                                step="0.01"
                                value={entry.amount ?? ""}
                                onChange={e => updateEntry(globalIndex, "amount", e.target.value)}
                                placeholder="Amount"
                                className={`${isAnchor ? anchorCellInputClass : inRange && hasMultiSelection ? selectedCellInputClass : cellInputClass} text-right font-medium tabular-nums`}
                              />
                            </td>
                          );
                        })()}
                        <td className="border border-gray-200 px-1 py-1 text-center w-8">
                          <button type="button" onClick={() => removeEntry(globalIndex)} className="text-red-400 hover:text-red-600 text-xs px-1">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Cell input style */
const cellInputClass = "border border-gray-200 bg-white px-2 py-1 text-sm w-full outline-none focus:ring-1 focus:ring-blue-300";
const activeCellInputClass = "border border-blue-400 bg-blue-50/40 px-2 py-1 text-sm w-full outline-none ring-1 ring-blue-300";
/** Input style inside a selected cell — transparent bg so td highlight shows through, border hidden so td ring is the visible border. */
const selectedCellInputClass = "border border-transparent bg-transparent px-2 py-1 text-sm w-full outline-none";
const anchorCellInputClass = "border border-transparent bg-transparent px-2 py-1 text-sm w-full outline-none";

/** Selection cell styles — use ring-inset (box-shadow) because border-collapse
 *  swallows border-color changes on shared edges between cells. */
const selectedCellClass = "bg-blue-100 ring-1 ring-inset ring-blue-400";
const anchorCellClass = "bg-blue-200 ring-2 ring-inset ring-blue-500";
const selectedHeaderClass = "!bg-blue-100 ring-1 ring-inset ring-blue-400";

/** Clipboard icon (small, for Copy Table button) */
function ClipboardIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}

function GroupSection({ group, allEntries, onUpdate, onUpdateAttr, onRemove, onAdd, onRename, onBulkChange,
  selection, range, isDragging, hasMultiSelection, handleCellMouseDownEvent, selectRange, globalHeaderRow, globalDataStart }: {
  group: EntryGroup;
  allEntries: EntryRow[];
  onUpdate: (globalIndex: number, field: keyof EntryRow, value: string) => void;
  onUpdateAttr: (globalIndex: number, key: string, value: string) => void;
  onRemove: (globalIndex: number) => void;
  onAdd: () => void;
  onRename: (newName: string) => void;
  onBulkChange: (entries: EntryRow[]) => void;
  // Selection props from parent
  selection: SelectionState | null;
  range: NormalizedRange | null;
  isDragging: boolean;
  hasMultiSelection: boolean;
  handleCellMouseDownEvent: (e: React.MouseEvent, row: number, col: number) => void;
  selectRange: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
  globalHeaderRow: number;
  globalDataStart: number;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.type);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const totalCols = 2 + group.columns.length;
  const lastCol = totalCols - 1;
  const lastGlobalDataRow = globalDataStart + group.entries.length - 1;

  /** Copy the entire group table as TSV to clipboard */
  const handleCopyTable = useCallback(() => {
    const tsv = groupToTsv(group.entries, group.columns);
    navigator.clipboard.writeText(tsv).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [group.entries, group.columns]);

  /** Select entire group (header + all data rows) using global coords */
  const handleSelectGroup = useCallback(() => {
    selectRange(globalHeaderRow, 0, lastGlobalDataRow, lastCol);
  }, [selectRange, globalHeaderRow, lastGlobalDataRow, lastCol]);

  /**
   * Apply a single cell value update to the entries array.
   * localRow = index within this group's entries array.
   * col: 0 = label, 1 = amount, 2+ = attr columns.
   */
  const setCellValue = useCallback(
    (entriesCopy: EntryRow[], localRow: number, col: number, value: string) => {
      const globalIndex = group.entries[localRow]?.globalIndex;
      if (globalIndex == null) return;
      if (col === 0) {
        entriesCopy[globalIndex] = { ...entriesCopy[globalIndex], label: value || "" };
      } else if (col === 1) {
        entriesCopy[globalIndex] = {
          ...entriesCopy[globalIndex],
          amount: value === "" ? null : parseFloat(value),
        };
      } else {
        const attrCol = group.columns[col - 2];
        if (!attrCol) return;
        const current = entriesCopy[globalIndex].attrs ?? {};
        entriesCopy[globalIndex] = {
          ...entriesCopy[globalIndex],
          attrs: {
            ...current,
            [attrCol.key]: value === "" ? null : (isNaN(Number(value)) ? value : Number(value)),
          },
        };
      }
    },
    [group.entries, group.columns],
  );

  /** Handle Ctrl+V paste: if TSV, spread across cells starting at active cell */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTableElement>) => {
      const text = e.clipboardData.getData("text/plain");
      if (!isTsvText(text) || !activeCell) return;

      e.preventDefault();

      const rows = parseTsv(text);
      const updated = [...allEntries];

      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const targetRow = activeCell.row + r;
          const targetCol = activeCell.col + c;
          if (targetRow < group.entries.length) {
            setCellValue(updated, targetRow, targetCol, rows[r][c]);
          }
        }
      }

      onBulkChange(updated);
    },
    [activeCell, allEntries, group.entries.length, setCellValue, onBulkChange],
  );

  /** Track which cell is active when an input inside the table gains focus (local rows for paste) */
  const handleFocusCapture = useCallback((e: React.FocusEvent<HTMLTableElement>) => {
    const input = e.target as HTMLElement;
    if (input.tagName !== "INPUT") return;
    const row = input.getAttribute("data-row");
    const col = input.getAttribute("data-col");
    if (row != null && col != null) {
      setActiveCell({ row: parseInt(row, 10), col: parseInt(col, 10) });
    }
  }, []);

  return (
    <div className="rounded-lg border border-gray-100">
      {/* Group header */}
      <div className="flex items-center justify-between rounded-t-lg bg-gray-50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={() => { onRename(name); setEditingName(false); }}
              onKeyDown={e => { if (e.key === "Enter") { onRename(name); setEditingName(false); } }}
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs font-semibold uppercase"
              autoFocus
            />
          ) : (
            <button
              onClick={(e) => {
                if (e.detail === 2) {
                  setEditingName(true);
                } else {
                  handleSelectGroup();
                }
              }}
              className="text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600"
              title="Click to select group, double-click to rename"
            >
              {titleCase(group.type)}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyTable}
            className="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Copy table as TSV (for pasting into Excel)"
          >
            <ClipboardIcon />
            {copyFeedback ? "Copied!" : "Copy"}
          </button>
        </div>
        <button type="button" onClick={onAdd} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600">
          + Add
        </button>
      </div>

      {/* Table with attrs columns */}
      <div className="overflow-x-auto">
        <table
          ref={tableRef}
          className={`w-full text-left text-sm ${isDragging ? "select-none [&_input]:pointer-events-none" : ""}`}
          style={{ borderCollapse: "collapse" }}
          onFocusCapture={handleFocusCapture}
          onPaste={handlePaste}
          tabIndex={-1}
        >
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              {(["Entry", "Amount", ...group.columns.map(c => c.label)] as string[]).map((label, colIdx) => {
                const inRange = range ? isCellInRange(globalHeaderRow, colIdx, range) : false;
                const isAnchor = hasMultiSelection && selection?.anchor.row === globalHeaderRow && selection?.anchor.col === colIdx;
                return (
                  <th
                    key={colIdx}
                    {...{ [DATA_ATTR_ROW]: globalHeaderRow, [DATA_ATTR_COL]: colIdx }}
                    className={`border px-2 py-1 font-medium ${colIdx === 1 ? "text-right w-24" : ""} ${
                      isAnchor ? anchorCellClass
                        : inRange ? selectedHeaderClass
                        : "border-gray-200"
                    }`}
                    onMouseDown={(e) => handleCellMouseDownEvent(e, globalHeaderRow, colIdx)}
                  >
                    {label}
                  </th>
                );
              })}
              <th className="border border-gray-200 px-1 py-1 w-8" />
            </tr>
          </thead>
          <tbody>
            {group.entries.map(({ entry, globalIndex }, localRow) => {
              const attrs = entry.attrs ?? {};
              const globalRow = globalDataStart + localRow;
              const isActiveRow = activeCell?.row === localRow;
              return (
                <tr key={globalIndex} className={hasMultiSelection ? "" : "hover:bg-blue-50/30"}>
                  {/* Label cell (col 0) */}
                  {(() => {
                    const colIdx = 0;
                    const inRange = range ? isCellInRange(globalRow, colIdx, range) : false;
                    const isAnchor = hasMultiSelection && selection?.anchor.row === globalRow && selection?.anchor.col === colIdx;
                    const isActive = !hasMultiSelection && isActiveRow && activeCell?.col === colIdx;
                    return (
                      <td
                        {...{ [DATA_ATTR_ROW]: globalRow, [DATA_ATTR_COL]: colIdx }}
                        className={`border p-0 ${
                          isAnchor ? anchorCellClass
                            : inRange && hasMultiSelection ? selectedCellClass
                            : isActive ? "border-blue-400"
                            : "border-gray-200"
                        }`}
                        onMouseDown={(e) => handleCellMouseDownEvent(e, globalRow, colIdx)}
                      >
                        <input
                          data-row={localRow}
                          data-col={colIdx}
                          value={entry.label}
                          onChange={e => onUpdate(globalIndex, "label", e.target.value)}
                          placeholder="Label"
                          className={isAnchor ? anchorCellInputClass : inRange && hasMultiSelection ? selectedCellInputClass : isActive ? activeCellInputClass : cellInputClass}
                        />
                      </td>
                    );
                  })()}
                  {/* Amount cell (col 1) */}
                  {(() => {
                    const colIdx = 1;
                    const inRange = range ? isCellInRange(globalRow, colIdx, range) : false;
                    const isAnchor = hasMultiSelection && selection?.anchor.row === globalRow && selection?.anchor.col === colIdx;
                    const isActive = !hasMultiSelection && isActiveRow && activeCell?.col === colIdx;
                    return (
                      <td
                        {...{ [DATA_ATTR_ROW]: globalRow, [DATA_ATTR_COL]: colIdx }}
                        className={`border p-0 ${
                          isAnchor ? anchorCellClass
                            : inRange && hasMultiSelection ? selectedCellClass
                            : isActive ? "border-blue-400"
                            : "border-gray-200"
                        }`}
                        onMouseDown={(e) => handleCellMouseDownEvent(e, globalRow, colIdx)}
                      >
                        <input
                          data-row={localRow}
                          data-col={colIdx}
                          type="number"
                          step="0.01"
                          value={entry.amount ?? ""}
                          onChange={e => onUpdate(globalIndex, "amount", e.target.value)}
                          className={`${isAnchor ? anchorCellInputClass : inRange && hasMultiSelection ? selectedCellInputClass : isActive ? activeCellInputClass : cellInputClass} text-right tabular-nums`}
                        />
                      </td>
                    );
                  })()}
                  {/* Attr cells (col 2+) */}
                  {group.columns.map((col, ci) => {
                    const colIdx = ci + 2;
                    const inRange = range ? isCellInRange(globalRow, colIdx, range) : false;
                    const isAnchor = hasMultiSelection && selection?.anchor.row === globalRow && selection?.anchor.col === colIdx;
                    const isActive = !hasMultiSelection && isActiveRow && activeCell?.col === colIdx;
                    return (
                      <td
                        key={col.key}
                        {...{ [DATA_ATTR_ROW]: globalRow, [DATA_ATTR_COL]: colIdx }}
                        className={`border p-0 ${
                          isAnchor ? anchorCellClass
                            : inRange && hasMultiSelection ? selectedCellClass
                            : isActive ? "border-blue-400"
                            : "border-gray-200"
                        }`}
                        onMouseDown={(e) => handleCellMouseDownEvent(e, globalRow, colIdx)}
                      >
                        <input
                          data-row={localRow}
                          data-col={colIdx}
                          value={formatAttrValue(attrs[col.key])}
                          onChange={e => onUpdateAttr(globalIndex, col.key, e.target.value)}
                          className={isAnchor ? anchorCellInputClass : inRange && hasMultiSelection ? selectedCellInputClass : isActive ? activeCellInputClass : cellInputClass}
                        />
                      </td>
                    );
                  })}
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <button type="button" onClick={() => onRemove(globalIndex)} className="text-red-400 hover:text-red-600">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
