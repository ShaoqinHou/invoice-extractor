'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import type { InvoiceStatus } from '@/types/invoice';

interface InvoiceCardProps {
  id: number;
  display_name: string;
  status: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  total_amount?: number | null;
  ocr_tier?: number | null;
  selected?: boolean;
  onSelect?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export function InvoiceCard(props: InvoiceCardProps) {
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

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${props.display_name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/invoices/${props.id}`, { method: 'DELETE' });
      props.onDelete?.(props.id);
    } catch { /* ignore */ }
  }

  function handleDownload(e: React.MouseEvent, format: 'csv' | 'xlsx') {
    e.preventDefault();
    e.stopPropagation();
    window.open(`/api/invoices/download?ids=${props.id}&format=${format}`, '_blank');
    setDlOpen(false);
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    props.onSelect?.(props.id);
  }

  return (
    <div className="flex items-center border-b border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50">
      {props.onSelect && (
        <label className="flex items-center pl-3" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={props.selected ?? false}
            onChange={handleSelect}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 dark:border-zinc-600"
          />
        </label>
      )}
      <Link
        href={`/invoices/${props.id}`}
        className="grid min-w-0 flex-1 grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-3 py-2.5"
      >
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {props.display_name}
          </span>
          {props.supplier_name && (
            <span className="block truncate text-xs text-zinc-500">{props.supplier_name}</span>
          )}
        </div>
        <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
          {props.invoice_date ?? ''}
        </span>
        <span className="shrink-0 text-sm font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
          {props.total_amount != null ? `$${props.total_amount.toFixed(2)}` : ''}
        </span>
        <StatusBadge status={(props.status ?? 'uploading') as InvoiceStatus} />
      </Link>
      <div className="mr-3 flex items-center gap-1">
        <div ref={dlRef} className="relative">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDlOpen(v => !v); }}
            className="shrink-0 rounded p-1.5 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
            title="Download"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          {dlOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              <button
                onClick={(e) => handleDownload(e, 'csv')}
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                CSV
              </button>
              <button
                onClick={(e) => handleDownload(e, 'xlsx')}
                className="block w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Excel
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="shrink-0 rounded p-1.5 text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
          title="Delete"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
