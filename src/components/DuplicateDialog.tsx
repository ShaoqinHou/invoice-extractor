'use client';

interface DuplicateDialogProps {
  filename: string;
  existingId: number;
  existingName: string;
  onViewExisting: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({ filename, existingId, existingName, onViewExisting, onCancel }: DuplicateDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Duplicate Detected</h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">{filename}</span> has already been uploaded as{' '}
          <span className="font-medium">{existingName}</span>.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onViewExisting}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            View Existing
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
