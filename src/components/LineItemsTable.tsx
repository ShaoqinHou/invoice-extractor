interface InvoiceEntry {
  id?: number;
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs: Record<string, unknown> | null;
}

const SUMMARY_TYPES = new Set(['total', 'due', 'subtotal', 'tax', 'discount', 'adjustment']);

const TYPE_STYLES: Record<string, string> = {
  total: 'font-bold text-zinc-900 dark:text-zinc-100',
  due: 'font-bold text-zinc-900 dark:text-zinc-100',
  subtotal: 'font-semibold text-zinc-800 dark:text-zinc-200',
  tax: 'text-zinc-600 dark:text-zinc-400',
  discount: 'text-green-700 dark:text-green-400',
  adjustment: 'text-amber-700 dark:text-amber-400',
  info: 'text-zinc-500 dark:text-zinc-500 italic',
};

/** Fixed columns in display order */
const FIXED_ATTRS = ['unit', 'unit_amount', 'unit_price'] as const;
const FIXED_LABELS: Record<string, string> = {
  unit: 'Unit',
  unit_amount: 'Qty',
  unit_price: 'Rate',
};

function formatAttrValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toString();
  return String(value);
}

function formatAmount(amount: number | null): string {
  if (amount === null) return '';
  return `${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}`;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** A displayable column from attrs */
interface AttrColumn {
  key: string;
  label: string;
}

/** Build ordered column list: fixed columns first, then extras with labels */
function buildAttrColumns(entries: InvoiceEntry[]): AttrColumn[] {
  const columns: AttrColumn[] = [];
  const hasKey = new Set<string>();

  // Check which fixed columns are present
  for (const entry of entries) {
    const attrs = entry.attrs ?? {};
    for (const key of Object.keys(attrs)) {
      if (attrs[key] != null && attrs[key] !== '') hasKey.add(key);
    }
  }

  // Add fixed columns in order
  for (const key of FIXED_ATTRS) {
    if (hasKey.has(key)) {
      columns.push({ key, label: FIXED_LABELS[key] });
    }
  }

  // Add extra columns (extra1, extra2, ...) using their labels
  const extraNums: number[] = [];
  for (const key of hasKey) {
    const match = key.match(/^extra(\d+)$/);
    if (match) extraNums.push(parseInt(match[1], 10));
  }
  extraNums.sort((a, b) => a - b);

  for (const n of extraNums) {
    // Find the label from any entry that has it
    let label = `Extra ${n}`;
    for (const entry of entries) {
      const l = entry.attrs?.[`extra${n}_label`];
      if (typeof l === 'string' && l) { label = l; break; }
    }
    columns.push({ key: `extra${n}`, label });
  }

  // Add any remaining non-standard keys (legacy attrs not yet normalized)
  const usedKeys = new Set([...FIXED_ATTRS, ...extraNums.flatMap(n => [`extra${n}`, `extra${n}_label`])]);
  const legacyKeys: string[] = [];
  for (const key of hasKey) {
    if (!usedKeys.has(key) && !key.endsWith('_label')) {
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
  entries: InvoiceEntry[];
  columns: AttrColumn[];
}

function groupEntries(items: InvoiceEntry[]): { groups: EntryGroup[]; summaryEntries: InvoiceEntry[] } {
  const groupMap = new Map<string, InvoiceEntry[]>();
  const order: string[] = [];
  const summaryEntries: InvoiceEntry[] = [];

  for (const item of items) {
    const type = item.entry_type ?? 'other';
    if (SUMMARY_TYPES.has(type)) {
      summaryEntries.push(item);
      continue;
    }
    if (!groupMap.has(type)) {
      groupMap.set(type, []);
      order.push(type);
    }
    groupMap.get(type)!.push(item);
  }

  const groups: EntryGroup[] = order.map(type => {
    const entries = groupMap.get(type)!;
    const columns = buildAttrColumns(entries);
    return { type, entries, columns };
  });

  return { groups, summaryEntries };
}

export function LineItemsTable({ items }: { items: InvoiceEntry[] }) {
  if (items.length === 0) return null;

  const { groups, summaryEntries } = groupEntries(items);
  const hasGrouping = groups.length > 1 || (groups.length === 1 && groups[0].columns.length > 0);

  if (!hasGrouping && groups.length <= 1) {
    return <FlatTable items={items} />;
  }

  return (
    <div className="space-y-4">
      {groups.map(group => (
        <GroupTable key={group.type} group={group} />
      ))}
      {summaryEntries.length > 0 && (
        <SummaryTable entries={summaryEntries} />
      )}
    </div>
  );
}

function FlatTable({ items }: { items: InvoiceEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="pb-2 pr-4 font-medium">Entry</th>
            <th className="pb-2 pr-4 font-medium text-right">Amount</th>
            <th className="pb-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((entry) => {
            const rowStyle = TYPE_STYLES[entry.entry_type ?? ''] ?? 'text-zinc-700 dark:text-zinc-300';
            const isSummary = SUMMARY_TYPES.has(entry.entry_type ?? '');
            const attrs = entry.attrs ?? {};
            const attrKeys = Object.keys(attrs).filter(k => attrs[k] != null && attrs[k] !== '' && !k.endsWith('_label'));

            return (
              <tr
                key={entry.id}
                className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 ${isSummary ? 'border-t-2 border-zinc-300 dark:border-zinc-600' : ''}`}
              >
                <td className={`py-2 pr-4 ${rowStyle}`}>{entry.label}</td>
                <td className={`py-2 pr-4 text-right tabular-nums ${rowStyle}`}>
                  {formatAmount(entry.amount)}
                </td>
                <td className="py-2 text-xs text-zinc-500">
                  {attrKeys.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {attrKeys.map(key => (
                        <span key={key} className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                          <span className="text-zinc-400">{key}:</span>
                          <span className="text-zinc-600 dark:text-zinc-400">{formatAttrValue(attrs[key])}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupTable({ group }: { group: EntryGroup }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {titleCase(group.type)}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-zinc-100 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th className="px-3 py-1.5 font-medium">Entry</th>
              <th className="px-3 py-1.5 font-medium text-right">Amount</th>
              {group.columns.map(col => (
                <th key={col.key} className="px-3 py-1.5 font-medium">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {group.entries.map(entry => {
              const attrs = entry.attrs ?? {};
              return (
                <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{entry.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatAmount(entry.amount)}
                  </td>
                  {group.columns.map(col => (
                    <td key={col.key} className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">
                      {formatAttrValue(attrs[col.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTable({ entries }: { entries: InvoiceEntry[] }) {
  return (
    <div className="border-t-2 border-zinc-300 pt-2 dark:border-zinc-600">
      {entries.map(entry => {
        const rowStyle = TYPE_STYLES[entry.entry_type ?? ''] ?? 'text-zinc-700 dark:text-zinc-300';
        return (
          <div key={entry.id} className={`flex justify-between py-1 text-sm ${rowStyle}`}>
            <span>{entry.label}</span>
            <span className="tabular-nums">{formatAmount(entry.amount)}</span>
          </div>
        );
      })}
    </div>
  );
}
