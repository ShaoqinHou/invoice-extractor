interface PdfViewerProps {
  invoiceId: number;
  filename: string;
}

const IMAGE_EXTENSIONS = new Set([".heic", ".heif", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"]);

export function PdfViewer({ invoiceId, filename }: PdfViewerProps) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  const fileUrl = `/api/invoices/${invoiceId}/file`;
  const isImage = IMAGE_EXTENSIONS.has(ext);

  if (isImage) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 p-4">
        <img src={fileUrl} alt={filename} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  return (
    <iframe
      src={fileUrl}
      title={filename}
      className="h-full w-full border-0"
    />
  );
}
