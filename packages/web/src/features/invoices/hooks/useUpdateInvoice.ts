import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import type { Invoice } from "../types";

interface UpdatePayload {
  id: number;
  data: Partial<Omit<Invoice, "id">>;
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation<Invoice, Error, UpdatePayload>({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Update failed");
      }
      return res.json();
    },
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}
