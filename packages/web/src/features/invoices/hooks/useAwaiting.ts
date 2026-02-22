import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import { API_BASE } from "@web/lib/api";
import type { Invoice } from "../types";

interface AwaitingResponse {
  invoices: Invoice[];
}

export function useAwaiting() {
  const queryClient = useQueryClient();
  const prevIdsRef = useRef<Set<number>>(new Set());

  const query = useQuery<Invoice[]>({
    queryKey: invoiceKeys.awaiting(),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/invoices/awaiting`);
      if (!res.ok) throw new Error("Failed to fetch awaiting invoices");
      const data: AwaitingResponse = await res.json();
      return data.invoices ?? [];
    },
    refetchInterval: 5000,
    staleTime: 0,
  });

  // Prefetch detail data for newly appeared invoices so the review form
  // has data immediately when the user clicks (no empty-field flash).
  useEffect(() => {
    if (!query.data) return;

    const currentIds = new Set(query.data.map((inv) => inv.id));
    const prevIds = prevIdsRef.current;

    let hasNew = false;
    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        hasNew = true;
        // New invoice appeared in awaiting list — prefetch its full detail
        queryClient.prefetchQuery({
          queryKey: invoiceKeys.detail(id),
          queryFn: async () => {
            const res = await fetch(`${API_BASE}/invoices/${id}`);
            if (!res.ok) throw new Error("Failed to fetch invoice");
            return res.json();
          },
          staleTime: 10 * 1000,
        });
      }
    }

    // When new items appear in awaiting (finished extraction), refresh the
    // invoice list so the table updates without a manual page reload.
    if (hasNew && prevIds.size > 0) {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    }

    prevIdsRef.current = currentIds;
  }, [query.data, queryClient]);

  return query;
}
