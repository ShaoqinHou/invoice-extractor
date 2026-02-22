import { useParams } from "@tanstack/react-router";
import { Loader2, AlertCircle } from "lucide-react";
import { ReviewSidebar } from "../components/ReviewSidebar";
import { PdfViewer } from "../components/PdfViewer";
import { ReviewForm } from "../components/ReviewForm";
import { SplitPane } from "../components/SplitPane";
import { useInvoice } from "../hooks/useInvoice";

export function ReviewDetailPage() {
  const params = useParams({ from: "/invoices/$id" });
  const id = Number(params.id);

  const { data: invoice, isLoading, error } = useInvoice(id);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0078c8]" />
        <span className="ml-2 text-sm text-gray-500">Loading invoice...</span>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm font-medium text-gray-700">Failed to load invoice</p>
          <p className="text-xs text-gray-500">{error?.message ?? "Invoice not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — fixed 280px */}
      <ReviewSidebar />

      {/* Right: PDF viewer + Review form in resizable split */}
      <div className="flex-1 overflow-hidden">
        <SplitPane
          left={
            <PdfViewer
              invoiceId={invoice.id}
              filename={invoice.original_filename}
            />
          }
          right={
            <ReviewForm key={invoice.id} invoice={invoice} />
          }
          storageKey="reviewSplitPane"
          defaultRatio={0.55}
        />
      </div>
    </div>
  );
}
