import { useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { OcrTierBadge } from "./OcrTierBadge";
import { TierReprocessButtons } from "./TierReprocessButtons";
import { EditableEntriesTable } from "./EditableEntriesTable";
import { StatusBadge } from "./StatusBadge";
import { useApprove } from "../hooks/useApprove";
import { useDeleteInvoice } from "../hooks/useDeleteInvoice";
import type { InvoiceWithEntries, InvoiceEntry } from "../types";

interface EntryRow {
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs?: Record<string, unknown> | null;
}

interface ReviewFormProps {
  invoice: InvoiceWithEntries;
}

const EXCEPTION_MESSAGES: Record<string, { title: string; description: string }> = {
  scan_quality: {
    title: "Poor Scan Quality",
    description: "OCR confidence is low. Values may be inaccurate — please verify carefully.",
  },
  investigate: {
    title: "Amounts Need Investigation",
    description: "Line items may not add up, or GST calculation appears off.",
  },
  value_mismatch: {
    title: "Supplier Mismatch",
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
      const res = await fetch("/api/invoices/awaiting");
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
      // Try to find next awaiting invoice before deleting
      let nextId: number | null = null;
      try {
        const res = await fetch("/api/invoices/awaiting");
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
    // Invalidation handled by useReprocess hook; router refresh triggers re-fetch
    router.invalidate();
  }

  const exceptionInfo = invoice.exception_type
    ? EXCEPTION_MESSAGES[invoice.exception_type] ?? { title: invoice.exception_type, description: invoice.exception_details ?? "" }
    : null;

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

        {/* Fields */}
        <Field label="Display Name" value={displayName} onChange={setDisplayName} />
        <Field label="Supplier" value={supplierName} onChange={setSupplierName} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice #" value={invoiceNumber} onChange={setInvoiceNumber} />
          <Field label="Date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Total" value={totalAmount} onChange={setTotalAmount} type="number" />
          <Field label="GST" value={gstAmount} onChange={setGstAmount} type="number" />
          <Field label="Currency" value={currency} onChange={setCurrency} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GST Number" value={gstNumber} onChange={setGstNumber} />
          <Field label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
        </div>

        <EditableEntriesTable entries={entries} onChange={setEntries} />

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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]/20"
      />
    </div>
  );
}
