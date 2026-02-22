import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import type { InvoiceWithEntries } from "../types";

export function useInvoice(id: number) {
  return useQuery<InvoiceWithEntries>({
    queryKey: invoiceKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    staleTime: 10 * 1000,
    enabled: id > 0,
  });
}
