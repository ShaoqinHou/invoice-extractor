import { useRef, useState, useCallback } from "react";
import { Upload, X, CheckCircle, Loader2 } from "lucide-react";
import { useUpload, isDuplicateError } from "../hooks/useUpload";
import { DuplicateDialog } from "./DuplicateDialog";
import { useNavigate } from "@tanstack/react-router";

interface FileStatus {
  file: File;
  state: "uploading" | "done" | "error" | "duplicate";
  error?: string;
  uploadedId?: number;
}

interface DuplicateInfo {
  filename: string;
  existingId: number;
  existingName: string;
}

interface UploadDropZoneProps {
  compact?: boolean;
}

export function UploadDropZone({ compact = false }: UploadDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [dragging, setDragging] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const { mutateAsync } = useUpload();
  const navigate = useNavigate();

  const upload = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const newStatuses: FileStatus[] = arr.map(f => ({ file: f, state: "uploading" }));
    setFiles(prev => [...prev, ...newStatuses]);

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      try {
        const result = await mutateAsync(file);
        setFiles(prev =>
          prev.map(s =>
            s.file === file ? { ...s, state: "done", uploadedId: result.id } : s
          )
        );
      } catch (err) {
        if (isDuplicateError(err)) {
          setDuplicate({
            filename: err.filename,
            existingId: err.existing_id,
            existingName: err.existing_name,
          });
          setFiles(prev =>
            prev.map(s => s.file === file ? { ...s, state: "duplicate" } : s)
          );
        } else {
          setFiles(prev =>
            prev.map(s =>
              s.file === file
                ? { ...s, state: "error", error: err instanceof Error ? err.message : "Upload failed" }
                : s
            )
          );
        }
      }
    }
  }, [mutateAsync]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      upload(e.dataTransfer.files);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      upload(e.target.files);
    }
    e.target.value = "";
  }

  if (compact) {
    return (
      <div className="px-3 pb-3">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-3 text-xs text-gray-500 transition-colors ${
            dragging ? "border-[#0078c8] bg-blue-50 text-[#0078c8]" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <Upload className="mb-1 h-4 w-4" />
          <span>Drop or click to upload</span>
        </div>
        <input ref={inputRef} type="file" className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.webp,.heic,.heif" onChange={onInputChange} />

        {/* Per-file progress — compact */}
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.slice(-5).map((fs, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                {fs.state === "uploading" && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                {fs.state === "done" && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                {fs.state === "error" && <X className="h-3 w-3 text-red-500" />}
                {fs.state === "duplicate" && <span className="text-amber-500">dup</span>}
                <span className="truncate text-gray-600" title={fs.file.name}>{fs.file.name}</span>
              </div>
            ))}
          </div>
        )}

        {duplicate && (
          <DuplicateDialog
            open={true}
            filename={duplicate.filename}
            existingId={duplicate.existingId}
            existingName={duplicate.existingName}
            onViewExisting={() => {
              setDuplicate(null);
              navigate({ to: "/invoices/$id", params: { id: String(duplicate.existingId) } });
            }}
            onCancel={() => setDuplicate(null)}
          />
        )}
      </div>
    );
  }

  // Full-size version for InvoicesPage
  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 text-gray-500 transition-colors ${
          dragging ? "border-[#0078c8] bg-blue-50 text-[#0078c8]" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <Upload className="mb-2 h-8 w-8" />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="mt-1 text-xs text-gray-400">PDF, PNG, JPG, TIFF, BMP, HEIC</p>
      </div>
      <input ref={inputRef} type="file" className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.webp,.heic,.heif" onChange={onInputChange} />

      {files.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {files.map((fs, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm">
              {fs.state === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />}
              {fs.state === "done" && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
              {fs.state === "error" && <X className="h-4 w-4 text-red-500 flex-shrink-0" />}
              {fs.state === "duplicate" && <span className="text-xs font-medium text-amber-600 flex-shrink-0">Duplicate</span>}
              <span className="truncate flex-1 text-gray-700">{fs.file.name}</span>
              {fs.state === "error" && <span className="text-xs text-red-500">{fs.error}</span>}
            </div>
          ))}
        </div>
      )}

      {duplicate && (
        <DuplicateDialog
          open={true}
          filename={duplicate.filename}
          existingId={duplicate.existingId}
          existingName={duplicate.existingName}
          onViewExisting={() => {
            setDuplicate(null);
            navigate({ to: "/invoices/$id", params: { id: String(duplicate.existingId) } });
          }}
          onCancel={() => setDuplicate(null)}
        />
      )}
    </div>
  );
}
