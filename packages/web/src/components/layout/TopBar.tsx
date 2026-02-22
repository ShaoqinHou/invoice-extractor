import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useAwaiting } from "../../features/invoices/hooks/useAwaiting";

export function TopBar() {
  const { data: awaitingInvoices = [] } = useAwaiting();
  const awaitingCount = awaitingInvoices.length;

  return (
    <header className="flex h-12 items-center border-b border-gray-200 bg-white px-4 shadow-sm flex-shrink-0">
      {/* App name */}
      <div className="flex items-center gap-2 font-semibold text-gray-900 mr-6">
        <FileText className="h-5 w-5 text-[#0078c8]" />
        Invoice Extractor
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        <Link
          to="/invoices"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          activeProps={{ className: "bg-[#0078c8]/10 text-[#0078c8]" }}
        >
          All Invoices
          {awaitingCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {awaitingCount > 99 ? "99+" : awaitingCount}
            </span>
          )}
        </Link>
      </nav>
    </header>
  );
}
