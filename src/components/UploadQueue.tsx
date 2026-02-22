'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import type { InvoiceStatus } from '@/types/invoice';

interface QueueItem {
  id: number;
  display_name: string;
  original_filename: string;
  status: string;
  upload_date: string | null;
  error_message: string | null;
}

export function UploadQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [awaitingIds, setAwaitingIds] = useState<number[]>([]);
  const [removing, setRemoving] = useState<Set<number>>(new Set());

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [queueRes, awaitingRes] = await Promise.all([
          fetch('/api/invoices/queue'),
          fetch('/api/invoices/awaiting'),
        ]);
        if (!active) return;
        const queueData = await queueRes.json();
        const awaitingData = await awaitingRes.json();
        setQueue(queueData);
        setAwaitingIds(awaitingData.invoices?.map((i: { id: number }) => i.id) ?? []);
      } catch { /* ignore polling errors */ }
    }

    poll();
    const interval = setInterval(poll, 2500);
    return () => { active = false; clearInterval(interval); };
  }, []);

  async function handleRemove(id: number) {
    setRemoving(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      setQueue(prev => prev.filter(it => it.id !== id));
      setAwaitingIds(prev => prev.filter(aid => aid !== id));
    } catch { /* ignore */ }
    setRemoving(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  if (queue.length === 0 && awaitingIds.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Processing Queue</h2>
      <div className="space-y-2">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {item.original_filename}
                </span>
                <StatusBadge status={(item.status ?? 'uploading') as InvoiceStatus} />
              </div>
            </div>
            <button
              onClick={() => handleRemove(item.id)}
              disabled={removing.has(item.id)}
              className="ml-3 rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-700 dark:hover:text-red-400"
            >
              Cancel
            </button>
          </div>
        ))}
        {awaitingIds.map((id) => (
          <div
            key={`awaiting-${id}`}
            className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950"
          >
            <div className="flex items-center gap-2">
              <StatusBadge status="draft" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Invoice #{id}</span>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/review/${id}`}
                className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-500"
              >
                Review
              </Link>
              <button
                onClick={() => handleRemove(id)}
                disabled={removing.has(id)}
                className="rounded-lg border border-orange-300 px-2 py-1 text-xs text-orange-600 hover:bg-orange-100 disabled:opacity-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900"
              >
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
