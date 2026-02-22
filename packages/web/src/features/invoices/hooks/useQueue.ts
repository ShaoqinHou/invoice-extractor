import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import type { Invoice } from "../types";

interface QueueResponse {
  invoices: Invoice[];
}

export function useQueue() {
  return useQuery<Invoice[]>({
    queryKey: invoiceKeys.queue(),
    queryFn: async () => {
      const res = await fetch("/api/invoices/queue");
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data = await res.json();
      // API may return raw array or { invoices: [] }
      return Array.isArray(data) ? data : (data.invoices ?? []);
    },
    refetchInterval: 2500,
    staleTime: 0,
  });
}
