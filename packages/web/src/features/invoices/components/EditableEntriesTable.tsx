import { useState } from "react";

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
              onUpdate={updateEntry}
              onUpdateAttr={updateAttr}
              onRemove={removeEntry}
              onAdd={() => addEntryToGroup(group.type)}
              onRename={(newName) => renameGroup(group.type, newName)}
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

function GroupSection({ group, onUpdate, onUpdateAttr, onRemove, onAdd, onRename }: {
  group: EntryGroup;
  onUpdate: (globalIndex: number, field: keyof EntryRow, value: string) => void;
  onUpdateAttr: (globalIndex: number, key: string, value: string) => void;
  onRemove: (globalIndex: number) => void;
  onAdd: () => void;
  onRename: (newName: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.type);

  return (
    <div className="rounded-lg border border-gray-100">
      {/* Group header */}
      <div className="flex items-center justify-between rounded-t-lg bg-gray-50 px-3 py-1.5">
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
        <button type="button" onClick={onAdd} className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600">
          + Add
        </button>
      </div>

      {/* Table with attrs columns */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ borderCollapse: "collapse" }}>
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
            {group.entries.map(({ entry, globalIndex }) => {
              const attrs = entry.attrs ?? {};
              return (
                <tr key={globalIndex} className="hover:bg-blue-50/30">
                  <td className="border border-gray-200 p-0">
                    <input
                      value={entry.label}
                      onChange={e => onUpdate(globalIndex, "label", e.target.value)}
                      placeholder="Label"
                      className={cellInputClass}
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input
                      type="number"
                      step="0.01"
                      value={entry.amount ?? ""}
                      onChange={e => onUpdate(globalIndex, "amount", e.target.value)}
                      className={`${cellInputClass} text-right tabular-nums`}
                    />
                  </td>
                  {group.columns.map(col => (
                    <td key={col.key} className="border border-gray-200 p-0">
                      <input
                        value={formatAttrValue(attrs[col.key])}
                        onChange={e => onUpdateAttr(globalIndex, col.key, e.target.value)}
                        className={cellInputClass}
                      />
                    </td>
                  ))}
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
