import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAwaiting } from "../hooks/useAwaiting";
import { useQueue } from "../hooks/useQueue";
import { UploadDropZone } from "./UploadDropZone";
import { StatusBadge } from "./StatusBadge";

export function ReviewSidebar() {
  const params = useParams({ strict: false });
  const currentId = params.id ? Number(params.id) : null;

  const { data: queueItems = [], isLoading: queueLoading } = useQueue();
  const { data: awaitingItems = [], isLoading: awaitingLoading } = useAwaiting();

  return (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden">
      {/* Upload drop zone */}
      <div className="border-b border-gray-200 pt-3">
        <UploadDropZone compact />
      </div>

      {/* Processing section */}
      {(queueLoading || queueItems.length > 0) && (
        <div className="border-b border-gray-200">
          <div className="px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Processing {queueLoading ? "" : `(${queueItems.length})`}
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {queueLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            ) : (
              queueItems.map(inv => (
                <div key={inv.id} className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-0">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />
                  <span className="truncate text-xs text-gray-600">{inv.display_name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Awaiting Review section */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Awaiting Review {awaitingLoading ? "" : `(${awaitingItems.length})`}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {awaitingLoading ? (
            <div className="p-3 text-xs text-gray-400">Loading...</div>
          ) : awaitingItems.length === 0 ? (
            <div className="p-3 text-xs text-gray-400">No invoices to review</div>
          ) : (
            awaitingItems.map(inv => {
              const isActive = currentId === inv.id;
              return (
                <Link
                  key={inv.id}
                  to="/invoices/$id"
                  params={{ id: String(inv.id) }}
                  className={`block border-b border-gray-100 px-3 py-2 text-xs transition-colors last:border-0 ${
                    isActive
                      ? "bg-[#0078c8]/10 text-[#0078c8]"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={inv.status} exceptionType={inv.exception_type} compact />
                    {isActive && (
                      <span className="block h-1.5 w-1.5 rounded-full bg-[#0078c8] flex-shrink-0" />
                    )}
                    <span className="truncate font-medium">
                      {inv.supplier_name || inv.display_name}
                    </span>
                  </div>
                  {inv.total_amount != null && (
                    <div className="mt-0.5 pl-[26px] tabular-nums text-gray-400">
                      ${inv.total_amount.toFixed(2)}
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Back to all invoices */}
      <div className="border-t border-gray-200 px-3 py-3">
        <Link
          to="/invoices"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Invoices
        </Link>
      </div>
    </div>
  );
}
