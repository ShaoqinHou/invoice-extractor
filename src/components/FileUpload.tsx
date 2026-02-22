'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DuplicateDialog } from './DuplicateDialog';

interface UploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'accepted' | 'duplicate' | 'error';
  invoiceId?: number;
  error?: string;
  duplicateId?: number;
  duplicateName?: string;
}

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [duplicate, setDuplicate] = useState<UploadItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // Guard against double-upload of same file
  const uploadingRef = useRef(new Set<string>());

  // Auto-clear accepted items after 2s so UploadQueue takes over tracking
  useEffect(() => {
    const hasAccepted = items.some(it => it.status === 'accepted');
    if (!hasAccepted) return;
    const timer = setTimeout(() => {
      setItems(prev => prev.filter(it => it.status !== 'accepted'));
    }, 2000);
    return () => clearTimeout(timer);
  }, [items]);

  const ACCEPTED = new Set(['.pdf', '.heic', '.heif', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.webp']);

  const uploadFile = useCallback(async (file: File, index: number) => {
    // Prevent double-upload of same file
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    if (uploadingRef.current.has(fileKey)) return;
    uploadingRef.current.add(fileKey);

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!ACCEPTED.has(ext)) {
      setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'error', error: 'Unsupported file type' } : it));
      uploadingRef.current.delete(fileKey);
      return;
    }

    setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'uploading' } : it));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/invoices', { method: 'POST', body: formData });
      const data = await res.json();

      if (res.status === 409) {
        setItems(prev => prev.map((it, i) => i === index
          ? { ...it, status: 'duplicate', duplicateId: data.existing_id, duplicateName: data.existing_name }
          : it
        ));
        setDuplicate({ file, status: 'duplicate', duplicateId: data.existing_id, duplicateName: data.existing_name });
        return;
      }

      if (!res.ok) {
        setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'error', error: data.error } : it));
        return;
      }

      setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'accepted', invoiceId: data.id } : it));
    } catch {
      setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'error', error: 'Upload failed' } : it));
    } finally {
      uploadingRef.current.delete(fileKey);
    }
  }, []);

  const handleFiles = useCallback((files: FileList) => {
    const fileArr = Array.from(files);
    const newItems: UploadItem[] = fileArr.map(file => ({ file, status: 'pending' as const }));

    setItems(prev => {
      const startIndex = prev.length;
      return [...prev, ...newItems];
    });

    // Fire uploads outside the state setter to avoid React batching issues
    const startIndex = items.length;
    fileArr.forEach((file, i) => {
      uploadFile(file, startIndex + i);
    });
  }, [uploadFile, items.length]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
    e.target.value = '';
  }, [handleFiles]);

  const statusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'pending': return <span className="text-zinc-400">...</span>;
      case 'uploading': return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />;
      case 'accepted': return <span className="text-green-600">Sent</span>;
      case 'duplicate': return <span className="text-amber-600">Dup</span>;
      case 'error': return <span className="text-red-600">Err</span>;
    }
  };

  const visibleItems = items.filter(it => it.status !== 'accepted');

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950'
            : 'border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.heic,.heif,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp"
          onChange={onFileSelect}
          multiple
          className="hidden"
        />
        <p className="text-zinc-600 dark:text-zinc-400">Drag & drop files here, or click to browse</p>
        <p className="mt-2 text-xs text-zinc-400">PDF, HEIC, JPG, PNG, TIFF, BMP, WebP up to 20MB</p>
      </div>

      {visibleItems.length > 0 && (
        <div className="mt-4 space-y-1">
          {visibleItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="w-10 text-center text-xs">{statusIcon(item.status)}</span>
              <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300">{item.file.name}</span>
              {item.error && <span className="text-xs text-red-500">{item.error}</span>}
            </div>
          ))}
        </div>
      )}

      {duplicate && (
        <DuplicateDialog
          filename={duplicate.file.name}
          existingId={duplicate.duplicateId!}
          existingName={duplicate.duplicateName!}
          onViewExisting={() => {
            router.push(`/invoices/${duplicate.duplicateId}`);
            setDuplicate(null);
          }}
          onCancel={() => setDuplicate(null)}
        />
      )}
    </div>
  );
}
