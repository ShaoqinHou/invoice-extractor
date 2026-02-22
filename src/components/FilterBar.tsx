'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const STATUS_TABS = [
  { value: 'approved,complete', label: 'Approved' },
  { value: 'draft,exception', label: 'Awaiting Review' },
  { value: 'uploading,extracting,processing,verifying', label: 'Processing' },
  { value: 'error', label: 'Errors' },
  { value: '', label: 'All' },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') ?? 'approved,complete';

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/invoices?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="mb-6 space-y-3">
      {/* Status tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {STATUS_TABS.map(tab => {
          const active = currentStatus === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => updateParam('status', tab.value)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search and date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search supplier, invoice #..."
            defaultValue={searchParams.get('search') ?? ''}
            onKeyDown={e => { if (e.key === 'Enter') updateParam('search', (e.target as HTMLInputElement).value); }}
            onBlur={e => updateParam('search', e.target.value)}
            className="w-56 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 pl-8 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <svg className="absolute left-2.5 top-2 h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span>Date:</span>
          <input
            type="date"
            defaultValue={searchParams.get('invoice_date_from') ?? ''}
            onChange={e => updateParam('invoice_date_from', e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <span>&ndash;</span>
          <input
            type="date"
            defaultValue={searchParams.get('invoice_date_to') ?? ''}
            onChange={e => updateParam('invoice_date_to', e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>
    </div>
  );
}
