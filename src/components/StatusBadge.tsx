import type { InvoiceStatus } from '@/types/invoice';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  queued: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  uploading: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  extracting: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  verifying: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  draft: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  exception: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  complete: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  queued: 'queued',
  uploading: 'uploading',
  extracting: 'extracting',
  processing: 'processing',
  verifying: 'verifying',
  draft: 'draft',
  exception: 'exception',
  approved: 'approved',
  complete: 'complete',
  error: 'error',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
