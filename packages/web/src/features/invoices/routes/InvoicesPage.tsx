import { useState, useRef } from "react";
import { Upload, Download, Search, X } from "lucide-react";
import { API_BASE } from "@web/lib/api";
import { PageContainer } from "../../../components/layout/PageContainer";
import { Button } from "../../../components/ui/Button";
import { InvoiceTable } from "../components/InvoiceTable";
import { UploadDropZone } from "../components/UploadDropZone";
import { useInvoices } from "../hooks/useInvoices";
import { useDeleteInvoice } from "../hooks/useDeleteInvoice";

type TabStatus = "all" | "processing" | "draft" | "approved" | "error";

const TABS: { key: TabStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "draft", label: "Awaiting Review" },
  { key: "approved", label: "Approved" },
  { key: "error", label: "Error" },
];

// Map tab → status query param (comma-separated for multiple statuses)
const TAB_STATUS_MAP: Record<TabStatus, string | undefined> = {
  all: undefined,
  processing: "queued,uploading,extracting,processing,verifying",
  draft: "draft,exception",
  approved: "approved",
  error: "error",
};

const PAGE_SIZE = 25;

export function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<TabStatus>("all");
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { mutate: deleteInvoice, isPending: deleting } = useDeleteInvoice();

  const statusFilter = TAB_STATUS_MAP[activeTab];
  const { data: invoices = [], isLoading, error } = useInvoices({
    status: statusFilter,
    search: deferredSearch || undefined,
  });

  function handleSearchChange(val: string) {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDeferredSearch(val);
      setPage(1);
    }, 300);
  }

  function handleTabChange(tab: TabStatus) {
    setActiveTab(tab);
    setPage(1);
    setSelectedIds(new Set());
  }

  function exportInvoices(ids: Set<number>, format: "csv" | "xlsx") {
    if (ids.size === 0) return;
    // Download each invoice as a separate file via hidden iframes
    // (browsers block multiple a.click() downloads from one handler)
    for (const id of ids) {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = `${API_BASE}/invoices/download?ids=${id}&format=${format}`;
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 30000);
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} invoice(s)? This cannot be undone.`)) return;
    for (const id of selectedIds) {
      deleteInvoice(id);
    }
    setSelectedIds(new Set());
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const paginated = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <PageContainer
      title="All Invoices"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportInvoices(selectedIds, "csv")}
            disabled={selectedIds.size === 0}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportInvoices(selectedIds, "xlsx")}
            disabled={selectedIds.size === 0}
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowUpload(prev => !prev)}
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
      }
    >
      {/* Upload panel */}
      {showUpload && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Upload Invoices</span>
            <button onClick={() => setShowUpload(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <UploadDropZone />
        </div>
      )}

      {/* Status tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex gap-0" aria-label="Status tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-[#0078c8] text-[#0078c8]"
                  : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Search + bulk actions bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search invoices..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#0078c8] focus:outline-none focus:ring-1 focus:ring-[#0078c8]/20"
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
            <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              onClick={() => exportInvoices(selectedIds, "csv")}
              className="flex items-center gap-1 text-sm text-[#0078c8] hover:text-[#006bb3]"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={() => exportInvoices(selectedIds, "xlsx")}
              className="flex items-center gap-1 text-sm text-[#0078c8] hover:text-[#006bb3]"
            >
              <Download className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-500">
          Loading invoices...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load invoices. Please try again.
        </div>
      ) : (
        <>
          <InvoiceTable
            invoices={paginated}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, invoices.length)} of {invoices.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
