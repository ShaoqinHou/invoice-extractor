'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReprocessButton({ invoiceId }: { invoiceId: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleReprocess() {
    if (!confirm('Re-run LLM extraction on this invoice? This will replace current data.')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/reprocess`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Reprocess failed.');
        return;
      }
      router.refresh();
    } catch {
      alert('Reprocess failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleReprocess}
      disabled={loading}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {loading ? 'Reprocessing...' : 'Reprocess'}
    </button>
  );
}
