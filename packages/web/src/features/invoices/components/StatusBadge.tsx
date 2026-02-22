import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import type { InvoiceStatus } from "../types";

const STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  queued: "default",
  uploading: "processing",
  extracting: "processing",
  processing: "processing",
  verifying: "processing",
  draft: "warning",
  exception: "orange",
  approved: "success",
  complete: "success",
  error: "error",
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  queued: "Queued",
  uploading: "Uploading",
  extracting: "Extracting",
  processing: "Processing",
  verifying: "Verifying",
  draft: "Awaiting Review",
  exception: "Exception",
  approved: "Approved",
  complete: "Complete",
  error: "Error",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = status as InvoiceStatus;
  const variant = STATUS_VARIANT[s] ?? "default";
  const label = STATUS_LABELS[s] ?? status;
  return <Badge variant={variant}>{label}</Badge>;
}
