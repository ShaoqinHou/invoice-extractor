import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import { API_BASE } from "@web/lib/api";
import type { Invoice } from "../types";

interface QueueResponse {
  invoices: Invoice[];
}

export function useQueue() {
  const queryClient = useQueryClient();
  const prevIdsRef = useRef<Set<number>>(new Set());

  const query = useQuery<Invoice[]>({
    queryKey: invoiceKeys.queue(),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/invoices/queue`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data = await res.json();
      // API may return raw array or { invoices: [] }
      return Array.isArray(data) ? data : (data.invoices ?? []);
    },
    refetchInterval: 2500,
    staleTime: 0,
  });

  // When items leave the queue (finished processing), invalidate lists
  // and detail caches so the table and detail page auto-update.
  useEffect(() => {
    if (!query.data) return;

    const currentIds = new Set(query.data.map((inv) => inv.id));
    const prevIds = prevIdsRef.current;

    // Check if any items left the queue (finished processing)
    if (prevIds.size > 0) {
      for (const id of prevIds) {
        if (!currentIds.has(id)) {
          // Item finished — invalidate lists and its detail cache
          queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
          queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
        }
      }
    }

    prevIdsRef.current = currentIds;
  }, [query.data, queryClient]);

  return query;
}
