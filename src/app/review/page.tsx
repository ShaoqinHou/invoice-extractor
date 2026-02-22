import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema';
import { inArray, desc, sql } from 'drizzle-orm';
import { StatusBadge } from '@/components/StatusBadge';
import type { InvoiceStatus } from '@/types/invoice';

export const dynamic = 'force-dynamic';

export default function ReviewListPage() {
  let awaitingInvoices: Array<{
    id: number;
    display_name: string;
    status: string | null;
    supplier_name: string | null;
    invoice_date: string | null;
    total_amount: number | null;
    ocr_tier: number | null;
  }> = [];
  let count = 0;
  let dbError = false;

  try {
    const db = getDb();
    awaitingInvoices = db
      .select({
        id: invoices.id,
        display_name: invoices.display_name,
        status: invoices.status,
        supplier_name: invoices.supplier_name,
        invoice_date: invoices.invoice_date,
        total_amount: invoices.total_amount,
        ocr_tier: invoices.ocr_tier,
      })
      .from(invoices)
      .where(inArray(invoices.status, ['draft', 'exception']))
      .orderBy(desc(invoices.id))
      .all();

    const countResult = db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(inArray(invoices.status, ['draft', 'exception']))
      .all();
    count = countResult[0]?.count ?? 0;
  } catch {
    dbError = true;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Review</h1>
          {count > 0 && (
            <p className="mt-1 text-sm text-zinc-500">{count} invoice{count !== 1 ? 's' : ''} awaiting review</p>
          )}
        </div>
        <Link
          href="/upload"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Upload
        </Link>
      </div>

      {dbError ? (
        <p className="text-sm text-zinc-500">Database not initialized yet.</p>
      ) : awaitingInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 p-12 dark:border-zinc-700">
          <p className="text-lg font-medium text-zinc-500">All caught up!</p>
          <p className="mt-1 text-sm text-zinc-400">No invoices awaiting review.</p>
          <Link href="/upload" className="mt-4 text-sm text-blue-600 hover:underline">Upload more invoices</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {awaitingInvoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/review/${inv.id}`}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {inv.display_name}
                  </span>
                  <StatusBadge status={(inv.status ?? 'uploading') as InvoiceStatus} />
                </div>
                <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                  {inv.supplier_name && <span>{inv.supplier_name}</span>}
                  {inv.invoice_date && <span>{inv.invoice_date}</span>}
                  {inv.total_amount != null && <span>${inv.total_amount.toFixed(2)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
