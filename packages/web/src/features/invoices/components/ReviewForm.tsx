import { useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { API_BASE } from "@web/lib/api";
import { Button } from "../../../components/ui/Button";
import {
  useCellSelection,
  isCellInRange,
  isMultiCellSelection,
  DATA_ATTR_ROW,
  DATA_ATTR_COL,
} from "@web/components/patterns/cell-selection";
import { OcrTierBadge } from "./OcrTierBadge";
import { TierReprocessButtons } from "./TierReprocessButtons";
import {
  EditableEntriesTable,
  groupEntries,
  buildGlobalRowMap,
  buildGlobalCellValueGetter,
  getColCountForRow,
  computeEffectiveRange,
  crossSectionCopyText,
} from "./EditableEntriesTable";
import type { EntryRow, HeaderFieldDef, SectionRowMap } from "./EditableEntriesTable";
import { StatusBadge } from "./StatusBadge";
import { useApprove } from "../hooks/useApprove";
import { useDeleteInvoice } from "../hooks/useDeleteInvoice";
import type { InvoiceWithEntries, InvoiceEntry } from "../types";

interface ReviewFormProps {
  invoice: InvoiceWithEntries;
}

const EXCEPTION_MESSAGES: Record<string, { title: string; description: string }> = {
  scan_quality: {
    title: "Scan Quality",
    description: "OCR confidence is low. Values may be inaccurate — please verify carefully.",
  },
  duplicate: {
    title: "Duplicate Invoice",
    description: "This supplier already has an invoice with this number on file.",
  },
  amount_mismatch: {
    title: "Amount Mismatch",
    description: "Line item totals do not add up to the invoice total.",
  },
  no_gst: {
    title: "No GST",
    description: "GST number was not found on the invoice.",
  },
  gst_mismatch: {
    title: "GST Mismatch",
    description: "GST amount was not found, not indicated, or is not 15%.",
  },
  value_mismatch: {
    title: "Value Mismatch",
    description: "Supplier details differ from the supplier master record.",
  },
};

function entryToRow(e: InvoiceEntry): EntryRow {
  return {
    label: e.label,
    amount: e.amount,
    entry_type: e.entry_type,
    attrs: e.attrs,
  };
}

/** Header field input style (inside td) */
const headerCellInputClass = "border border-gray-200 bg-white px-2 py-1.5 text-sm w-full outline-none focus:ring-1 focus:ring-blue-300";
const headerSelectedInputClass = "border border-transparent bg-transparent px-2 py-1.5 text-sm w-full outline-none";
const headerAnchorInputClass = "border border-transparent bg-transparent px-2 py-1.5 text-sm w-full outline-none";

/** Selection cell styles (same as in EditableEntriesTable) */
const selectedCellClass = "bg-blue-100 ring-1 ring-inset ring-blue-400";
const anchorCellClass = "bg-blue-200 ring-2 ring-inset ring-blue-500";

/** Number of header fields */
const HEADER_FIELD_COUNT = 9;

export function ReviewForm({ invoice }: ReviewFormProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const { mutateAsync: approve, isPending: approving } = useApprove();
  const { mutateAsync: deleteInvoice, isPending: deleting } = useDeleteInvoice();

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [supplierName, setSupplierName] = useState(invoice.supplier_name ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date ?? "");
  const [totalAmount, setTotalAmount] = useState(invoice.total_amount?.toString() ?? "");
  const [gstAmount, setGstAmount] = useState(invoice.gst_amount?.toString() ?? "");
  const [currency, setCurrency] = useState(invoice.currency ?? "NZD");
  const [gstNumber, setGstNumber] = useState(invoice.gst_number ?? "");
  const [dueDate, setDueDate] = useState(invoice.due_date ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [entries, setEntries] = useState<EntryRow[]>(invoice.entries.map(entryToRow));

  // Selection container ref — wraps header fields + entries table
  const containerRef = useRef<HTMLDivElement>(null);

  // Single shared selection state at the ReviewForm level
  const {
    selection,
    range,
    isDragging,
    handleCellMouseDown,
    clearSelection,
    selectRange,
  } = useCellSelection({ tableRef: containerRef });

  const hasMultiSelection = selection ? isMultiCellSelection(selection) : false;

  // Build header field definitions (for the global cell value getter)
  const headerFields: HeaderFieldDef[] = useMemo(() => [
    { label: "Display Name", value: displayName },
    { label: "Supplier", value: supplierName },
    { label: "Invoice #", value: invoiceNumber },
    { label: "Date", value: invoiceDate },
    { label: "Total", value: totalAmount },
    { label: "GST", value: gstAmount },
    { label: "Currency", value: currency },
    { label: "GST Number", value: gstNumber },
    { label: "Due Date", value: dueDate },
  ], [displayName, supplierName, invoiceNumber, invoiceDate, totalAmount, gstAmount, currency, gstNumber, dueDate]);

  // Compute groups + summary + row map
  const { groups, summaryEntries } = useMemo(() => groupEntries(entries), [entries]);
  const rowMap: SectionRowMap = useMemo(
    () => buildGlobalRowMap(HEADER_FIELD_COUNT, groups, summaryEntries.length),
    [groups, summaryEntries.length],
  );

  // Compute effective range (expands endCol when at right edge of a section)
  const effectiveRange = useMemo(
    () => range ? computeEffectiveRange(range, rowMap) : null,
    [range, rowMap],
  );

  // Global cell value getter for Ctrl+C copy
  const getGlobalCellValue = useMemo(
    () => buildGlobalCellValueGetter(rowMap, headerFields, groups, summaryEntries),
    [rowMap, headerFields, groups, summaryEntries],
  );

  // Header field setters indexed by row
  const headerSetters: ((v: string) => void)[] = useMemo(() => [
    setDisplayName, setSupplierName, setInvoiceNumber, setInvoiceDate,
    setTotalAmount, setGstAmount, setCurrency, setGstNumber, setDueDate,
  ], []);

  const headerTypes: string[] = useMemo(() => [
    "text", "text", "text", "date",
    "number", "number", "text", "text", "date",
  ], []);

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

  /** Container-level keyboard handler */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Ctrl+C: copy selection
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;

        if (range && hasMultiSelection) {
          const tsv = crossSectionCopyText(range, rowMap, getGlobalCellValue);
          navigator.clipboard.writeText(tsv);
          e.preventDefault();
          return;
        }

        // Single cell: copy cell value
        if (selection) {
          const value = getGlobalCellValue(selection.anchor.row, selection.anchor.col);
          navigator.clipboard.writeText(value);
          e.preventDefault();
          return;
        }
      }

      // Escape: clear selection and blur input
      if (e.key === "Escape") {
        clearSelection();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      // Arrow key navigation using global row numbers
      if (!selection) return;
      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!arrowKeys.includes(e.key)) return;

      e.preventDefault();
      const current = selection.focus;
      let nextRow = current.row;
      let nextCol = current.col;

      if (e.key === "ArrowUp") nextRow = Math.max(0, current.row - 1);
      if (e.key === "ArrowDown") nextRow = Math.min(rowMap.totalRows - 1, current.row + 1);
      if (e.key === "ArrowLeft") nextCol = Math.max(0, current.col - 1);
      if (e.key === "ArrowRight") {
        const maxCol = getColCountForRow(current.row, rowMap) - 1;
        nextCol = Math.min(maxCol, current.col + 1);
      }

      // Clamp column to the target row's column count
      const targetMaxCol = getColCountForRow(nextRow, rowMap) - 1;
      nextCol = Math.min(nextCol, targetMaxCol);

      if (e.shiftKey) {
        handleCellMouseDown(nextRow, nextCol, true);
      } else {
        handleCellMouseDown(nextRow, nextCol, false);
        // Focus the input in the target cell if any
        const input = containerRef.current?.querySelector(
          `[${DATA_ATTR_ROW}="${nextRow}"][${DATA_ATTR_COL}="${nextCol}"] input`,
        ) as HTMLInputElement | null;
        input?.focus();
      }
    },
    [selection, range, hasMultiSelection, getGlobalCellValue, clearSelection, handleCellMouseDown, rowMap],
  );

  async function handleApprove() {
    try {
      const result = await approve({
        id: invoice.id,
        display_name: displayName,
        supplier_name: supplierName || null,
        invoice_number: invoiceNumber || null,
        invoice_date: invoiceDate || null,
        total_amount: totalAmount ? parseFloat(totalAmount) : null,
        gst_amount: gstAmount ? parseFloat(gstAmount) : null,
        currency: currency || "NZD",
        gst_number: gstNumber || null,
        due_date: dueDate || null,
        notes: notes || null,
        entries,
      });

      if (result.nextId) {
        navigate({ to: "/invoices/$id", params: { id: String(result.nextId) } });
      } else {
        navigate({ to: "/invoices" });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approve failed.");
    }
  }

  async function handleSkip() {
    try {
      const res = await fetch(`${API_BASE}/invoices/awaiting`);
      const data = await res.json();
      const others = data.invoices?.filter((i: { id: number }) => i.id !== invoice.id);
      if (others?.length > 0) {
        navigate({ to: "/invoices/$id", params: { id: String(others[0].id) } });
      } else {
        navigate({ to: "/invoices" });
      }
    } catch {
      navigate({ to: "/invoices" });
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    try {
      let nextId: number | null = null;
      try {
        const res = await fetch(`${API_BASE}/invoices/awaiting`);
        const data = await res.json();
        const others = data.invoices?.filter((i: { id: number }) => i.id !== invoice.id);
        if (others?.length > 0) nextId = others[0].id;
      } catch { /* ignore */ }

      await deleteInvoice(invoice.id);

      if (nextId) {
        navigate({ to: "/invoices/$id", params: { id: String(nextId) } });
      } else {
        navigate({ to: "/invoices" });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function handleReprocessed() {
    router.invalidate();
  }

  const exceptionInfo = invoice.exception_type
    ? EXCEPTION_MESSAGES[invoice.exception_type] ?? { title: invoice.exception_type, description: invoice.exception_details ?? "" }
    : null;

  const selectionProps = { selection, range: effectiveRange, isDragging, handleCellMouseDown, clearSelection, selectRange };

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Exception banner */}
        {exceptionInfo && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-amber-800">{exceptionInfo.title}</span>
              <StatusBadge status="exception" />
            </div>
            <p className="mt-1 text-xs text-amber-700">{exceptionInfo.description}</p>
            {invoice.exception_details && invoice.exception_details !== exceptionInfo.description && (
              <p className="mt-1 text-xs text-amber-600">{invoice.exception_details}</p>
            )}
          </div>
        )}

        {/* OCR tier + reprocess */}
        <div className="flex items-center gap-2">
          <OcrTierBadge tier={invoice.ocr_tier} />
          {invoice.status && <StatusBadge status={invoice.status} />}
          <TierReprocessButtons
            invoiceId={invoice.id}
            currentTier={invoice.ocr_tier}
            onReprocessed={handleReprocessed}
          />
        </div>

        {/* Selection container: wraps header fields + entries */}
        <div
          ref={containerRef}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={`space-y-3 outline-none ${isDragging ? "select-none" : ""}`}
        >
          {/* Header fields as a selectable 2-column table */}
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {headerFields.map((field, i) => {
                const labelInRange = effectiveRange ? isCellInRange(i, 0, effectiveRange) : false;
                const labelIsAnchor = hasMultiSelection && selection?.anchor.row === i && selection?.anchor.col === 0;
                const valueInRange = effectiveRange ? isCellInRange(i, 1, effectiveRange) : false;
                const valueIsAnchor = hasMultiSelection && selection?.anchor.row === i && selection?.anchor.col === 1;
                return (
                  <tr key={field.label}>
                    <td
                      {...{ [DATA_ATTR_ROW]: i, [DATA_ATTR_COL]: 0 }}
                      className={`border p-0 w-28 ${
                        labelIsAnchor ? anchorCellClass
                          : labelInRange && hasMultiSelection ? selectedCellClass
                          : "border-gray-200"
                      }`}
                      onMouseDown={(e) => handleCellMouseDownEvent(e, i, 0)}
                    >
                      <span className="block px-2 py-1.5 text-xs font-medium text-gray-500 select-none">{field.label}</span>
                    </td>
                    <td
                      {...{ [DATA_ATTR_ROW]: i, [DATA_ATTR_COL]: 1 }}
                      className={`border p-0 ${
                        valueIsAnchor ? anchorCellClass
                          : valueInRange && hasMultiSelection ? selectedCellClass
                          : "border-gray-200"
                      }`}
                      onMouseDown={(e) => handleCellMouseDownEvent(e, i, 1)}
                    >
                      <input
                        type={headerTypes[i]}
                        step={headerTypes[i] === "number" ? "0.01" : undefined}
                        value={field.value}
                        onChange={e => headerSetters[i](e.target.value)}
                        className={
                          valueIsAnchor ? headerAnchorInputClass
                            : valueInRange && hasMultiSelection ? headerSelectedInputClass
                            : headerCellInputClass
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Entries table (groups + summary) */}
          <EditableEntriesTable
            entries={entries}
            onChange={setEntries}
            selectionProps={selectionProps}
            rowMap={rowMap}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]/20"
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-4">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          loading={deleting}
          className="flex-shrink-0"
        >
          Delete
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSkip}
          className="flex-shrink-0"
        >
          Skip
        </Button>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={handleApprove}
          loading={approving}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
