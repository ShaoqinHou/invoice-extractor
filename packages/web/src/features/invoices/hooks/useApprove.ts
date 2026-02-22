import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import { API_BASE } from "@web/lib/api";

interface ApprovePayload {
  id: number;
  display_name?: string;
  supplier_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  gst_amount?: number | null;
  currency?: string | null;
  gst_number?: string | null;
  due_date?: string | null;
  notes?: string | null;
  entries?: unknown[];
}

interface ApproveResult {
  nextId?: number;
}

export function useApprove() {
  const queryClient = useQueryClient();

  return useMutation<ApproveResult, Error, ApprovePayload>({
    mutationFn: async ({ id, ...body }) => {
      const res = await fetch(`${API_BASE}/invoices/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Approve failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
