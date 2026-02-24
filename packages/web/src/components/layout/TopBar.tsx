import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, LogOut, Shield } from "lucide-react";
import { useAwaiting } from "../../features/invoices/hooks/useAwaiting";
import { useMe, useLogout, useAuthStatus } from "../../features/auth/hooks/useAuth";

export function TopBar() {
  const navigate = useNavigate();
  const { data: awaitingInvoices = [] } = useAwaiting();
  const awaitingCount = awaitingInvoices.length;
  const { data: authStatus } = useAuthStatus();
  const { data: meData } = useMe();
  const logout = useLogout();

  const authEnabled = authStatus?.auth_enabled ?? false;
  const user = meData?.user;
  const isAdmin = user?.role === 'admin';

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => navigate({ to: '/login' }),
    });
  };

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

        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            activeProps={{ className: "bg-[#0078c8]/10 text-[#0078c8]" }}
          >
            <Shield className="h-3.5 w-3.5" />
            Admin
          </Link>
        )}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User menu */}
      {authEnabled && user && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {user.display_name || user.email}
            <span className="ml-1 inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] capitalize">
              {user.role}
            </span>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </header>
  );
}
