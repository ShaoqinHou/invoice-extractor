'use client';

import { useState, useRef, useEffect } from 'react';

interface TierReprocessButtonsProps {
  invoiceId: number;
  currentTier: number | null;
  onReprocessed?: () => void;
}

export function TierReprocessButtons({ invoiceId, currentTier, onReprocessed }: TierReprocessButtonsProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleReprocess(tier: 2 | 3) {
    setOpen(false);
    setLoading(tier);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Reprocess failed.');
        return;
      }
      onReprocessed?.();
    } catch {
      alert('Reprocess failed.');
    } finally {
      setLoading(null);
    }
  }

  if (currentTier === 3) return null;

  const options: { tier: 2 | 3; label: string }[] = [];
  if (currentTier === 1 || !currentTier) {
    options.push({ tier: 2, label: 'Tesseract' });
  }
  options.push({ tier: 3, label: 'PaddleOCR' });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading !== null}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {loading !== null ? 'Reprocessing...' : 'Reprocess'}
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {options.map(opt => (
            <button
              key={opt.tier}
              onClick={() => handleReprocess(opt.tier)}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
