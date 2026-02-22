import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import { API_BASE } from "@web/lib/api";

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/invoices/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
