'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function Nav() {
  const pathname = usePathname();
  const [awaitingCount, setAwaitingCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchCount() {
      try {
        const res = await fetch('/api/invoices/awaiting');
        if (!active) return;
        const data = await res.json();
        setAwaitingCount(data.count ?? 0);
      } catch { /* ignore */ }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const linkClass = (path: string) => {
    const active = pathname === path || pathname.startsWith(path + '/');
    return `text-sm ${active ? 'text-zinc-900 font-medium dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`;
  };

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Invoices
        </Link>

        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <Link href="/upload" className={linkClass('/upload')}>
            Upload
          </Link>
          <span className="mx-1">→</span>
          <Link href="/review" className={`${linkClass('/review')} relative`}>
            Review
            {awaitingCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-medium text-white">
                {awaitingCount}
              </span>
            )}
          </Link>
          <span className="mx-1">→</span>
          <Link href="/invoices" className={linkClass('/invoices')}>
            All Invoices
          </Link>
          <span className="mx-1">|</span>
          <Link href="/settings" className={linkClass('/settings')}>
            Settings
          </Link>
        </div>
      </div>
    </nav>
  );
}
