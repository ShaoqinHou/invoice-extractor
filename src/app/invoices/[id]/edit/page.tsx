'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface InvoiceData {
  id: number;
  display_name: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  notes: string | null;
}

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices/${params.id}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Failed to load invoice.'));
  }, [params.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: data.display_name,
          supplier_name: data.supplier_name || null,
          invoice_number: data.invoice_number || null,
          invoice_date: data.invoice_date || null,
          currency: data.currency || 'NZD',
          notes: data.notes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Save failed.');
        return;
      }

      router.push(`/invoices/${params.id}`);
      router.refresh();
    } catch {
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-zinc-500">Loading...</p>;

  function updateField(field: keyof InvoiceData, value: string) {
    setData(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Edit: {data.display_name}
      </h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Display Name" value={data.display_name} onChange={v => updateField('display_name', v)} />
          <FormField label="Supplier" value={data.supplier_name ?? ''} onChange={v => updateField('supplier_name', v)} />
          <FormField label="Invoice #" value={data.invoice_number ?? ''} onChange={v => updateField('invoice_number', v)} />
          <FormField label="Invoice Date" value={data.invoice_date ?? ''} onChange={v => updateField('invoice_date', v)} type="date" />
          <FormField label="Currency" value={data.currency ?? 'NZD'} onChange={v => updateField('currency', v)} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
          <textarea
            value={data.notes ?? ''}
            onChange={e => updateField('notes', e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({
  label, value, onChange, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </div>
  );
}
