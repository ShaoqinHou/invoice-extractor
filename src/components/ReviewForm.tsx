'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OcrTierBadge } from './OcrTierBadge';
import { TierReprocessButtons } from './TierReprocessButtons';
import { EditableEntriesTable } from './EditableEntriesTable';
import { StatusBadge } from './StatusBadge';
import type { InvoiceStatus, ExceptionType } from '@/types/invoice';

interface EntryRow {
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs?: Record<string, unknown> | null;
}

interface ReviewFormProps {
  invoice: {
    id: number;
    display_name: string;
    supplier_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
    gst_amount: number | null;
    currency: string | null;
    gst_number: string | null;
    due_date: string | null;
    notes: string | null;
    ocr_tier: number | null;
    status: string | null;
    exception_type: string | null;
    exception_details: string | null;
    entries: EntryRow[];
  };
}

const EXCEPTION_MESSAGES: Record<string, { title: string; description: string }> = {
  scan_quality: {
    title: 'Poor Scan Quality',
    description: 'OCR confidence is low. Values may be inaccurate — please verify carefully.',
  },
  investigate: {
    title: 'Amounts Need Investigation',
    description: 'Line items may not add up, or GST calculation appears off.',
  },
  value_mismatch: {
    title: 'Supplier Mismatch',
    description: 'Supplier details differ from the supplier master record.',
  },
};

export function ReviewForm({ invoice }: ReviewFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState(invoice.display_name);
  const [supplierName, setSupplierName] = useState(invoice.supplier_name ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoice_number ?? '');
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date ?? '');
  const [totalAmount, setTotalAmount] = useState(invoice.total_amount?.toString() ?? '');
  const [gstAmount, setGstAmount] = useState(invoice.gst_amount?.toString() ?? '');
  const [currency, setCurrency] = useState(invoice.currency ?? 'NZD');
  const [gstNumber, setGstNumber] = useState(invoice.gst_number ?? '');
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '');
  const [notes, setNotes] = useState(invoice.notes ?? '');
  const [entries, setEntries] = useState<EntryRow[]>(invoice.entries);

  async function handleApprove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          supplier_name: supplierName || null,
          invoice_number: invoiceNumber || null,
          invoice_date: invoiceDate || null,
          total_amount: totalAmount ? parseFloat(totalAmount) : null,
          gst_amount: gstAmount ? parseFloat(gstAmount) : null,
          currency: currency || 'NZD',
          gst_number: gstNumber || null,
          due_date: dueDate || null,
          notes: notes || null,
          entries,
        }),
      });

      const data = await res.json();
      if (data.nextId) {
        router.push(`/review/${data.nextId}`);
        router.refresh();
      } else {
        router.push('/review');
        router.refresh();
      }
    } catch {
      alert('Approve failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    fetch('/api/invoices/awaiting')
      .then(r => r.json())
      .then(data => {
        const others = data.invoices?.filter((i: { id: number }) => i.id !== invoice.id);
        if (others?.length > 0) {
          router.push(`/review/${others[0].id}`);
        } else {
          router.push('/review');
        }
      })
      .catch(() => router.push('/review'));
  }

  async function handleDelete() {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    let nextId: number | null = null;
    try {
      const listRes = await fetch('/api/invoices/awaiting');
      const listData = await listRes.json();
      const others = listData.invoices?.filter((i: { id: number }) => i.id !== invoice.id);
      if (others?.length > 0) nextId = others[0].id;
    } catch { /* ignore */ }
    await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
    if (nextId) {
      router.push(`/review/${nextId}`);
    } else {
      router.push('/review');
    }
    router.refresh();
  }

  const exceptionInfo = invoice.exception_type
    ? EXCEPTION_MESSAGES[invoice.exception_type] ?? { title: invoice.exception_type, description: invoice.exception_details ?? '' }
    : null;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex-1 space-y-3 overflow-auto">
        {/* Exception banner */}
        {exceptionInfo && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{exceptionInfo.title}</span>
              <StatusBadge status={'exception' as InvoiceStatus} />
            </div>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{exceptionInfo.description}</p>
            {invoice.exception_details && invoice.exception_details !== exceptionInfo.description && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{invoice.exception_details}</p>
            )}
          </div>
        )}

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
          <label className="mb-1 block text-xs font-medium text-zinc-500">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex items-center gap-2">
          {invoice.status && <StatusBadge status={invoice.status as InvoiceStatus} />}
          <OcrTierBadge tier={invoice.ocr_tier} />
          <TierReprocessButtons
            invoiceId={invoice.id}
            currentTier={invoice.ocr_tier}
            onReprocessed={() => router.refresh()}
          />
        </div>
      </div>

      <div className="flex gap-2 border-t border-zinc-200 pt-3 mt-3 dark:border-zinc-800">
        <button
          onClick={handleApprove}
          disabled={saving}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? 'Approving...' : 'Approve'}
        </button>
        <button
          onClick={handleSkip}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Skip
        </button>
        <button
          onClick={handleDelete}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500">{label}</label>
      <input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </div>
  );
}
