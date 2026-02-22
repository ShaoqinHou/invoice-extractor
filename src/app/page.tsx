import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
  let counts = { processing: 0, awaiting: 0, approved: 0, errors: 0 };
  let dbError = false;

  try {
    const db = getDb();
    const processingStatuses = ['uploading', 'extracting', 'processing', 'verifying'];
    counts.processing = db.select({ count: sql<number>`count(*)` }).from(invoices)
      .where(inArray(invoices.status, processingStatuses)).all()[0]?.count ?? 0;
    counts.awaiting = db.select({ count: sql<number>`count(*)` }).from(invoices)
      .where(inArray(invoices.status, ['draft', 'exception'])).all()[0]?.count ?? 0;
    counts.approved = db.select({ count: sql<number>`count(*)` }).from(invoices)
      .where(inArray(invoices.status, ['approved', 'complete'])).all()[0]?.count ?? 0;
    counts.errors = db.select({ count: sql<number>`count(*)` }).from(invoices)
      .where(eq(invoices.status, 'error')).all()[0]?.count ?? 0;
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Invoice Manager</h1>
          <p className="mb-6 text-sm text-zinc-500">Upload your first invoice to get started.</p>
          <Link
            href="/upload"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Upload
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* Workflow Steps — 3 cards with arrow connectors */}
      <div className="mb-10 flex items-stretch gap-3">
        <WorkflowStep
          step={1}
          label="Upload"
          description="Add invoices"
          count={counts.processing}
          countLabel="processing"
          href="/upload"
          active={counts.processing > 0}
          color="blue"
        />
        <Arrow />
        <WorkflowStep
          step={2}
          label="Review"
          description="Verify & approve"
          count={counts.awaiting}
          countLabel="awaiting"
          href="/review"
          active={counts.awaiting > 0}
          color="orange"
        />
        <Arrow />
        <WorkflowStep
          step={3}
          label="All Invoices"
          description="Browse & search"
          count={counts.approved}
          countLabel="approved"
          href="/invoices"
          active={false}
          color="green"
        />
      </div>

      {/* Action banners */}
      <div className="space-y-3">
        {counts.awaiting > 0 && (
          <Link
            href="/review"
            className="flex items-center justify-between rounded-lg border-2 border-orange-200 bg-orange-50 p-4 hover:border-orange-300 dark:border-orange-800 dark:bg-orange-950 dark:hover:border-orange-700"
          >
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-200">
                {counts.awaiting} invoice{counts.awaiting !== 1 ? 's' : ''} awaiting review
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-400">Click to start reviewing</p>
            </div>
            <span className="text-lg text-orange-400 dark:text-orange-600">&rarr;</span>
          </Link>
        )}

        {counts.errors > 0 && (
          <Link
            href="/invoices?status=error"
            className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 hover:border-red-300 dark:border-red-800 dark:bg-red-950 dark:hover:border-red-700"
          >
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">
                {counts.errors} invoice{counts.errors !== 1 ? 's' : ''} with errors
              </p>
              <p className="text-sm text-red-600 dark:text-red-400">May need reprocessing</p>
            </div>
            <span className="text-lg text-red-400 dark:text-red-600">&rarr;</span>
          </Link>
        )}

        {counts.awaiting === 0 && counts.errors === 0 && counts.processing === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500">All caught up. No invoices need attention.</p>
            <Link
              href="/upload"
              className="mt-3 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Upload more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center px-1 text-zinc-300 dark:text-zinc-600">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </div>
  );
}

function WorkflowStep({ step, label, description, count, countLabel, href, active, color }: {
  step: number;
  label: string;
  description: string;
  count: number;
  countLabel: string;
  href: string;
  active: boolean;
  color: 'blue' | 'orange' | 'green';
}) {
  const borderColor = active
    ? { blue: 'border-blue-400 dark:border-blue-500', orange: 'border-orange-400 dark:border-orange-500', green: 'border-green-400 dark:border-green-500' }[color]
    : 'border-zinc-200 dark:border-zinc-800';

  const countColor = {
    blue: 'text-blue-600 dark:text-blue-400',
    orange: 'text-orange-600 dark:text-orange-400',
    green: 'text-green-600 dark:text-green-400',
  }[color];

  return (
    <Link
      href={href}
      className={`flex-1 rounded-lg border-2 bg-white p-5 text-center transition-colors hover:border-zinc-400 dark:bg-zinc-900 dark:hover:border-zinc-600 ${borderColor}`}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">Step {step}</div>
      <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{label}</div>
      <div className="mt-1 text-sm text-zinc-500">{description}</div>
      {count > 0 && (
        <div className={`mt-3 text-2xl font-bold ${countColor}`}>
          {count}
          <span className="ml-1 text-xs font-normal text-zinc-400">{countLabel}</span>
        </div>
      )}
    </Link>
  );
}
