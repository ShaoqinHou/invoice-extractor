'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { LineItemsTable } from '@/components/LineItemsTable';
import { OcrTierBadge } from '@/components/OcrTierBadge';
import { TierReprocessButtons } from '@/components/TierReprocessButtons';
import { SplitPane } from '@/components/SplitPane';
import { PdfViewer } from '@/components/PdfViewer';
import { EditableEntriesTable } from '@/components/EditableEntriesTable';
import type { InvoiceStatus } from '@/types/invoice';

interface EntryRow {
  id?: number;
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs?: Record<string, unknown> | null;
}

interface InvoiceDetail {
  id: number;
  display_name: string;
  status: string | null;
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
  original_filename: string;
  file_path: string | null;
  approved_date: string | null;
  error_message: string | null;
  raw_extracted_text: string | null;
  raw_llm_response: string | null;
  entries: EntryRow[];
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      const parsed = parseInt(id, 10);
      if (isNaN(parsed)) return;
      setInvoiceId(parsed);
      fetchInvoice(parsed);
    });
  }, [params]);

  async function fetchInvoice(id: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setInvoice(data);
    } catch { /* ignore */ }
    setLoading(false);
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;
  if (!invoice || !invoiceId) return <p className="text-sm text-zinc-500">Invoice not found.</p>;

  if (editing) {
    return (
      <EditMode
        invoice={invoice}
        onSave={() => { setEditing(false); fetchInvoice(invoiceId); }}
        onCancel={() => setEditing(false)}
        onDelete={() => { router.push('/invoices'); router.refresh(); }}
      />
    );
  }

  return <ViewMode invoice={invoice} onEdit={() => setEditing(true)} onDelete={() => { router.push('/invoices'); router.refresh(); }} />;
}

function ViewMode({ invoice, onEdit, onDelete }: { invoice: InvoiceDetail; onEdit: () => void; onDelete: () => void }) {
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dlOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) setDlOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [dlOpen]);

  async function handleDelete() {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
    onDelete();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{invoice.display_name}</h1>
          <StatusBadge status={(invoice.status ?? 'uploading') as InvoiceStatus} />
          <OcrTierBadge tier={invoice.ocr_tier} />
        </div>
        <div className="flex items-center gap-2">
          <TierReprocessButtons invoiceId={invoice.id} currentTier={invoice.ocr_tier} onReprocessed={() => window.location.reload()} />
          <div ref={dlRef} className="relative">
            <button
              onClick={() => setDlOpen(v => !v)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Download
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dlOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                <a
                  href={`/api/invoices/download?ids=${invoice.id}&format=csv`}
                  className="block px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  onClick={() => setDlOpen(false)}
                >
                  CSV
                </a>
                <a
                  href={`/api/invoices/download?ids=${invoice.id}&format=xlsx`}
                  className="block px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  onClick={() => setDlOpen(false)}
                >
                  Excel
                </a>
              </div>
            )}
          </div>
          <button
            onClick={onEdit}
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="inline-flex h-9 items-center rounded-lg border border-red-300 px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </button>
        </div>
      </div>

      {invoice.error_message && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {invoice.error_message}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Supplier" value={invoice.supplier_name} />
        <Field label="Invoice #" value={invoice.invoice_number} />
        <Field label="Invoice Date" value={invoice.invoice_date} />
        <Field label="Total" value={invoice.total_amount != null ? `$${invoice.total_amount.toFixed(2)}` : null} />
        <Field label="GST" value={invoice.gst_amount != null ? `$${invoice.gst_amount.toFixed(2)}` : null} />
        <Field label="GST Number" value={invoice.gst_number} />
        <Field label="Due Date" value={invoice.due_date} />
        <Field label="Currency" value={invoice.currency} />
        <Field label="Original File" value={invoice.original_filename} />
        {invoice.approved_date && (
          <Field label="Approved" value={invoice.approved_date.slice(0, 10)} />
        )}
      </div>

      {invoice.entries.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Entries</h2>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <LineItemsTable items={invoice.entries.map(e => ({ ...e, attrs: e.attrs ?? null }))} />
          </div>
        </div>
      )}

      {invoice.notes && (
        <div className="mb-4 rounded-lg bg-zinc-100 p-4 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <span className="font-medium">Notes:</span> {invoice.notes}
        </div>
      )}

      {invoice.raw_extracted_text && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700">
            Raw Extracted Text
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {invoice.raw_extracted_text}
          </pre>
        </details>
      )}

      {invoice.raw_llm_response && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700">
            LLM Conversation Log
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {invoice.raw_llm_response}
          </pre>
        </details>
      )}
    </div>
  );
}

function EditMode({ invoice, onSave, onCancel, onDelete }: {
  invoice: InvoiceDetail;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
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

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
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
      onSave();
    } catch {
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
    onDelete();
  }

  const hasFile = !!invoice.file_path;

  const editForm = (
    <div className="flex h-full flex-col p-4">
      <div className="flex-1 space-y-3 overflow-auto">
        <EditField label="Display Name" value={displayName} onChange={setDisplayName} />
        <EditField label="Supplier" value={supplierName} onChange={setSupplierName} />
        <div className="grid grid-cols-2 gap-3">
          <EditField label="Invoice #" value={invoiceNumber} onChange={setInvoiceNumber} />
          <EditField label="Date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <EditField label="Total" value={totalAmount} onChange={setTotalAmount} type="number" />
          <EditField label="GST" value={gstAmount} onChange={setGstAmount} type="number" />
          <EditField label="Currency" value={currency} onChange={setCurrency} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EditField label="GST Number" value={gstNumber} onChange={setGstNumber} />
          <EditField label="Due Date" value={dueDate} onChange={setDueDate} type="date" />
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
          <OcrTierBadge tier={invoice.ocr_tier} />
          <TierReprocessButtons invoiceId={invoice.id} currentTier={invoice.ocr_tier} onReprocessed={() => window.location.reload()} />
        </div>
      </div>

      <div className="flex gap-2 border-t border-zinc-200 pt-3 mt-3 dark:border-zinc-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
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

  if (hasFile) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Editing: {invoice.display_name}</h1>
        </div>
        <SplitPane
          left={<PdfViewer invoiceId={invoice.id} filename={invoice.original_filename} />}
          right={editForm}
          storageKey="invoiceEditPane"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Editing: {invoice.display_name}</h1>
      </div>
      {editForm}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        {value ?? '\u2014'}
      </p>
    </div>
  );
}

function EditField({
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
