export const invoiceKeys = {
  all: ["invoices"] as const,
  lists: () => [...invoiceKeys.all, "list"] as const,
  list: (filters: Record<string, string>) => [...invoiceKeys.lists(), filters] as const,
  details: () => [...invoiceKeys.all, "detail"] as const,
  detail: (id: number) => [...invoiceKeys.details(), id] as const,
  queue: () => [...invoiceKeys.all, "queue"] as const,
  awaiting: () => [...invoiceKeys.all, "awaiting"] as const,
};
