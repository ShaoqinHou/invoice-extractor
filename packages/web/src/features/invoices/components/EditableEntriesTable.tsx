import { useState, useRef, useCallback } from "react";

interface EntryRow {
  id?: number;
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs?: Record<string, unknown> | null;
}

interface EditableEntriesTableProps {
  entries: EntryRow[];
  onChange: (entries: EntryRow[]) => void;
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

interface EntryGroup {
  type: string;
  entries: { entry: EntryRow; globalIndex: number }[];
  columns: AttrColumn[];
}

function groupEntries(entries: EntryRow[]): { groups: EntryGroup[]; summaryEntries: { entry: EntryRow; globalIndex: number }[] } {
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

export function EditableEntriesTable({ entries, onChange }: EditableEntriesTableProps) {
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);

  const { groups, summaryEntries } = groupEntries(entries);

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
          {groups.map(group => (
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
            />
          ))}

          {summaryEntries.length > 0 && (
            <div className="border-t-2 border-gray-300 pt-2">
              <div className="space-y-1">
                {summaryEntries.map(({ entry, globalIndex }) => (
                  <div key={globalIndex} className="flex items-center gap-2">
                    <input
                      value={entry.label}
                      onChange={e => updateEntry(globalIndex, "label", e.target.value)}
                      placeholder="Label"
                      className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm font-medium"
                    />
                    <select
                      value={entry.entry_type ?? "subtotal"}
                      onChange={e => updateEntry(globalIndex, "entry_type", e.target.value)}
                      className="w-20 rounded border border-gray-300 bg-white px-1 py-1 text-xs"
                    >
                      {ENTRY_TYPES.filter(t => SUMMARY_TYPES.has(t)).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={entry.amount ?? ""}
                      onChange={e => updateEntry(globalIndex, "amount", e.target.value)}
                      placeholder="Amount"
                      className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm font-medium tabular-nums"
                    />
                    <button type="button" onClick={() => removeEntry(globalIndex)} className="text-red-400 hover:text-red-600 text-xs px-1">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
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

/** Clipboard icon (small, for Copy Table button) */
function ClipboardIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}

function GroupSection({ group, allEntries, onUpdate, onUpdateAttr, onRemove, onAdd, onRename, onBulkChange }: {
  group: EntryGroup;
  allEntries: EntryRow[];
  onUpdate: (globalIndex: number, field: keyof EntryRow, value: string) => void;
  onUpdateAttr: (globalIndex: number, key: string, value: string) => void;
  onRemove: (globalIndex: number) => void;
  onAdd: () => void;
  onRename: (newName: string) => void;
  onBulkChange: (entries: EntryRow[]) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.type);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  /** Copy the entire group table as TSV to clipboard */
  const handleCopyTable = useCallback(() => {
    const tsv = groupToTsv(group.entries, group.columns);
    navigator.clipboard.writeText(tsv).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    });
  }, [group.entries, group.columns]);

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

      // Prevent default paste into the input
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

  /** Track which cell is active when an input inside the table gains focus */
  const handleFocusCapture = useCallback((e: React.FocusEvent<HTMLTableElement>) => {
    const input = e.target as HTMLElement;
    if (input.tagName !== "INPUT") return;
    const row = input.getAttribute("data-row");
    const col = input.getAttribute("data-col");
    if (row != null && col != null) {
      setActiveCell({ row: parseInt(row, 10), col: parseInt(col, 10) });
    }
  }, []);

  /** Keyboard handler on the table for Ctrl+C (copy current cell or selected text) */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        // If there is a text selection inside an input, let default copy happen
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;

        // Otherwise, copy the active cell value
        if (!activeCell) return;
        const entry = group.entries[activeCell.row];
        if (!entry) return;
        const value = getCellValue(entry.entry, activeCell.col, group.columns);
        navigator.clipboard.writeText(value);
        e.preventDefault();
      }
    },
    [activeCell, group.entries, group.columns],
  );

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
              onClick={() => setEditingName(true)}
              className="text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600"
              title="Click to rename group"
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
          className="w-full text-left text-sm"
          style={{ borderCollapse: "collapse" }}
          onFocusCapture={handleFocusCapture}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        >
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500">
              <th className="border border-gray-200 px-2 py-1 font-medium">Entry</th>
              <th className="border border-gray-200 px-2 py-1 font-medium text-right w-24">Amount</th>
              {group.columns.map(col => (
                <th key={col.key} className="border border-gray-200 px-2 py-1 font-medium">{col.label}</th>
              ))}
              <th className="border border-gray-200 px-1 py-1 w-8" />
            </tr>
          </thead>
          <tbody>
            {group.entries.map(({ entry, globalIndex }, localRow) => {
              const attrs = entry.attrs ?? {};
              const isActiveRow = activeCell?.row === localRow;
              return (
                <tr key={globalIndex} className="hover:bg-blue-50/30">
                  <td className={`border p-0 ${isActiveRow && activeCell?.col === 0 ? "border-blue-400" : "border-gray-200"}`}>
                    <input
                      data-row={localRow}
                      data-col={0}
                      value={entry.label}
                      onChange={e => onUpdate(globalIndex, "label", e.target.value)}
                      placeholder="Label"
                      className={isActiveRow && activeCell?.col === 0 ? activeCellInputClass : cellInputClass}
                    />
                  </td>
                  <td className={`border p-0 ${isActiveRow && activeCell?.col === 1 ? "border-blue-400" : "border-gray-200"}`}>
                    <input
                      data-row={localRow}
                      data-col={1}
                      type="number"
                      step="0.01"
                      value={entry.amount ?? ""}
                      onChange={e => onUpdate(globalIndex, "amount", e.target.value)}
                      className={`${isActiveRow && activeCell?.col === 1 ? activeCellInputClass : cellInputClass} text-right tabular-nums`}
                    />
                  </td>
                  {group.columns.map((col, colIdx) => {
                    const cIdx = colIdx + 2;
                    const isActive = isActiveRow && activeCell?.col === cIdx;
                    return (
                      <td key={col.key} className={`border p-0 ${isActive ? "border-blue-400" : "border-gray-200"}`}>
                        <input
                          data-row={localRow}
                          data-col={cIdx}
                          value={formatAttrValue(attrs[col.key])}
                          onChange={e => onUpdateAttr(globalIndex, col.key, e.target.value)}
                          className={isActive ? activeCellInputClass : cellInputClass}
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
