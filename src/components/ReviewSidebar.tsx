'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarInvoice {
  id: number;
  display_name: string;
  supplier_name: string | null;
  total_amount: number | null;
  status: string;
}

interface ReviewSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function ReviewSidebar({ collapsed, onToggle }: ReviewSidebarProps) {
  const pathname = usePathname();
  const [invoices, setInvoices] = useState<SidebarInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const currentId = pathname.match(/\/review\/(\d+)/)?.[1];

  useEffect(() => {
    fetch('/api/invoices/awaiting')
      .then(r => r.json())
      .then(data => {
        setInvoices(data.invoices || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pathname]); // refetch when navigating

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
        <button
          onClick={onToggle}
          className="mt-2 rounded p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Expand invoice list"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        <div className="mt-2 -rotate-90 whitespace-nowrap text-[10px] font-medium tracking-wider text-zinc-400">
          {invoices.length} INVOICES
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-56 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Review ({invoices.length})
        </span>
        <button
          onClick={onToggle}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Collapse invoice list"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 text-xs text-zinc-400">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="p-3 text-xs text-zinc-400">No invoices to review</div>
        ) : (
          invoices.map(inv => {
            const isActive = currentId === String(inv.id);
            return (
              <Link
                key={inv.id}
                href={`/review/${inv.id}`}
                className={`block border-b border-zinc-100 px-3 py-2 text-xs transition-colors dark:border-zinc-800 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                <div className="truncate font-medium">
                  {inv.supplier_name || inv.display_name}
                </div>
                {inv.total_amount != null && (
                  <div className="mt-0.5 tabular-nums text-zinc-400">
                    ${inv.total_amount.toFixed(2)}
                  </div>
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
