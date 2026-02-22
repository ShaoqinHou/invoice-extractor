'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { InvoiceCard } from '@/components/InvoiceCard';
import { FilterBar } from '@/components/FilterBar';

interface InvoiceItem {
  id: number;
  display_name: string;
  status: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  ocr_tier: number | null;
}

function InvoiceListInner() {
  const searchParams = useSearchParams();
  const [invoiceList, setInvoiceList] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('status')) {
      params.set('status', 'approved,complete');
    }

    setLoading(true);
    fetch(`/api/invoices?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setInvoiceList(data);
        setSelected(new Set());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [searchParams]);

  const handleDelete = useCallback((id: number) => {
    setInvoiceList(prev => prev.filter(inv => inv.id !== id));
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const handleSelect = useCallback((id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === invoiceList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoiceList.map(inv => inv.id)));
    }
  }, [selected.size, invoiceList]);

  function handleBulkDownload(format: 'csv' | 'xlsx') {
    const ids = [...selected].join(',');
    window.open(`/api/invoices/download?ids=${ids}&format=${format}`, '_blank');
  }

  async function handleBulkDelete() {
    const count = selected.size;
    if (!confirm(`Delete ${count} invoice${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selected].map(id =>
        fetch(`/api/invoices/${id}`, { method: 'DELETE' })
      ));
      setInvoiceList(prev => prev.filter(inv => !selected.has(inv.id)));
      setSelected(new Set());
    } catch { /* ignore */ }
    setBulkDeleting(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">All Invoices</h1>
        <Link
          href="/upload"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Upload
        </Link>
      </div>

      <FilterBar />

      {/* Bulk action bar — always visible when list has items */}
      {!loading && invoiceList.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={selected.size === invoiceList.length && invoiceList.length > 0}
              onChange={selectAll}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-600"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkDownload('csv')}
              disabled={selected.size === 0}
              className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              CSV
            </button>
            <button
              onClick={() => handleBulkDownload('xlsx')}
              disabled={selected.size === 0}
              className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Excel
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting || selected.size === 0}
              className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
            >
              {bulkDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : invoiceList.length === 0 ? (
        <p className="text-sm text-zinc-500">No invoices match the current filters.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="w-4" />
            <div>Invoice</div>
            <div>Date</div>
            <div>Amount</div>
            <div>Status</div>
            <div className="w-8" />
          </div>
          {invoiceList.map((inv) => (
            <InvoiceCard
              key={inv.id}
              {...inv}
              selected={selected.has(inv.id)}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InvoiceListPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading...</p>}>
      <InvoiceListInner />
    </Suspense>
  );
}
