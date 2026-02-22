import { useState, useCallback, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { TopBar } from "./TopBar";
import { useUpload } from "../../features/invoices/hooks/useUpload";

export function RootLayout() {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const { mutateAsync: upload } = useUpload();
  const [uploadStatus, setUploadStatus] = useState<{
    active: boolean;
    total: number;
    done: number;
  }>({ active: false, total: 0, done: 0 });

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setUploadStatus({ active: true, total: files.length, done: 0 });

    for (const file of files) {
      try {
        await upload(file);
      } catch {
        // Individual file errors handled silently — user sees results in list
      }
      setUploadStatus((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    // Keep the status visible briefly so user sees completion
    setTimeout(() => {
      setUploadStatus({ active: false, total: 0, done: 0 });
    }, 2000);
  }, [upload]);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-gray-50"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <TopBar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Global drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0078c8]/10 backdrop-blur-[2px] pointer-events-none">
          <div className="rounded-2xl border-4 border-dashed border-[#0078c8] bg-white/90 px-16 py-12 text-center shadow-2xl">
            <Upload className="mx-auto h-12 w-12 text-[#0078c8]" />
            <p className="mt-3 text-lg font-semibold text-[#0078c8]">
              Drop files to upload
            </p>
            <p className="mt-1 text-sm text-gray-500">
              PDF, PNG, JPG, TIFF, BMP, HEIC
            </p>
          </div>
        </div>
      )}

      {/* Upload progress toast */}
      {uploadStatus.active && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-gray-800">
            Uploading {uploadStatus.done}/{uploadStatus.total} files...
          </p>
          <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[#0078c8] transition-all duration-300"
              style={{
                width: `${(uploadStatus.done / uploadStatus.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
