import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import type { Invoice } from "../types";

interface UseInvoicesParams {
  status?: string;
  search?: string;
}

interface InvoicesResponse {
  invoices: Invoice[];
}

export function useInvoices(params: UseInvoicesParams = {}) {
  const filters: Record<string, string> = {};
  if (params.status) filters.status = params.status;
  if (params.search) filters.search = params.search;

  return useQuery<Invoice[]>({
    queryKey: invoiceKeys.list(filters),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set("status", params.status);
      if (params.search) searchParams.set("search", params.search);
      const qs = searchParams.toString();
      const res = await fetch(`/api/invoices${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch invoices");
      const data = await res.json();
      // API returns raw array
      return Array.isArray(data) ? data : (data.invoices ?? []);
    },
    staleTime: 30 * 1000,
  });
}
