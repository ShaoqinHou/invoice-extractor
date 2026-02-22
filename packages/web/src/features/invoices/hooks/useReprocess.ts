import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";

interface ReprocessPayload {
  id: number;
  tier: 2 | 3;
}

export function useReprocess() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReprocessPayload>({
    mutationFn: async ({ id, tier }) => {
      const res = await fetch(`/api/invoices/${id}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Reprocess failed");
      }
    },
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.queue() });
    },
  });
}
