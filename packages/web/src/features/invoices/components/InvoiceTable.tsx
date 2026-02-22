import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, Eye } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Button } from "../../../components/ui/Button";
import { useDeleteInvoice } from "../hooks/useDeleteInvoice";
import type { Invoice } from "../types";

type SortKey = "display_name" | "supplier_name" | "invoice_date" | "total_amount" | "status";
type SortDir = "asc" | "desc";

interface InvoiceTableProps {
  invoices: Invoice[];
  selectedIds: Set<number>;
  onSelectChange: (ids: Set<number>) => void;
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors whitespace-nowrap text-${align}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </span>
    </th>
  );
}

export function InvoiceTable({ invoices, selectedIds, onSelectChange }: InvoiceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("invoice_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { mutate: deleteInvoice } = useDeleteInvoice();

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...invoices].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "display_name":
        cmp = (a.display_name ?? "").localeCompare(b.display_name ?? "");
        break;
      case "supplier_name":
        cmp = (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "");
        break;
      case "invoice_date":
        cmp = (a.invoice_date ?? "").localeCompare(b.invoice_date ?? "");
        break;
      case "total_amount":
        cmp = (a.total_amount ?? 0) - (b.total_amount ?? 0);
        break;
      case "status":
        cmp = (a.status ?? "").localeCompare(b.status ?? "");
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleAll(checked: boolean) {
    if (checked) {
      onSelectChange(new Set(invoices.map(i => i.id)));
    } else {
      onSelectChange(new Set());
    }
  }

  function toggleOne(id: number, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    onSelectChange(next);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteInvoice(id);
  }

  const allSelected = invoices.length > 0 && invoices.every(i => selectedIds.has(i.id));
  const someSelected = invoices.some(i => selectedIds.has(i.id));

  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-gray-500">No invoices found</p>
          <p className="mt-1 text-xs text-gray-400">Upload a PDF or image to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={e => toggleAll(e.target.checked)}
                  className="rounded border-gray-300 text-[#0078c8] focus:ring-[#0078c8]"
                />
              </th>
              <SortableHeader label="Name" sortKey="display_name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Supplier" sortKey="supplier_name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Date" sortKey="invoice_date" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Amount" sortKey="total_amount" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} align="right" />
              <SortableHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} align="center" />
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(inv => (
              <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(inv.id) ? "bg-blue-50/40" : ""}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(inv.id)}
                    onChange={e => toggleOne(inv.id, e.target.checked)}
                    className="rounded border-gray-300 text-[#0078c8] focus:ring-[#0078c8]"
                  />
                </td>
                <td className="px-4 py-3 max-w-[180px]">
                  <Link
                    to="/invoices/$id"
                    params={{ id: String(inv.id) }}
                    className="text-[#0078c8] hover:underline font-medium truncate block"
                    title={inv.display_name}
                  >
                    {inv.display_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[150px]">
                  <span className="truncate block" title={inv.supplier_name ?? ""}>
                    {inv.supplier_name ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {inv.invoice_date ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                  {inv.total_amount != null ? `$${inv.total_amount.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {inv.status && <StatusBadge status={inv.status} />}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to="/invoices/$id"
                      params={{ id: String(inv.id) }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </Link>
                    <button
                      onClick={() => handleDelete(inv.id, inv.display_name)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
