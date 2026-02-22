import { FileUpload } from '@/components/FileUpload';
import { UploadQueue } from '@/components/UploadQueue';

export default function UploadPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Upload Invoices</h1>
      <FileUpload />
      <UploadQueue />
    </div>
  );
}
