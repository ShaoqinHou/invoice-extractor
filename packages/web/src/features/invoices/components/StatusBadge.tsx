import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import type { InvoiceStatus, ExceptionType } from "../types";

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

/** Compact 1-2 char codes for sidebar display */
const STATUS_COMPACT: Record<InvoiceStatus, string> = {
  queued: "Q",
  uploading: "U",
  extracting: "X",
  processing: "P",
  verifying: "V",
  draft: "D",
  exception: "!",
  approved: "\u2713",
  complete: "\u2713",
  error: "E",
};

/** Exception-specific labels and compact codes */
const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  scan_quality: "Scan Quality",
  duplicate: "Duplicate",
  amount_mismatch: "Amount Mismatch",
  no_gst: "No GST",
  gst_mismatch: "GST Mismatch",
  value_mismatch: "Value Mismatch",
};

const EXCEPTION_COMPACT: Record<ExceptionType, string> = {
  scan_quality: "SQ",
  duplicate: "DP",
  amount_mismatch: "AM",
  no_gst: "NG",
  gst_mismatch: "GM",
  value_mismatch: "VM",
};

const EXCEPTION_VARIANT: Record<ExceptionType, BadgeVariant> = {
  scan_quality: "orange",
  duplicate: "warning",
  amount_mismatch: "orange",
  no_gst: "warning",
  gst_mismatch: "warning",
  value_mismatch: "orange",
};

interface StatusBadgeProps {
  status: string;
  exceptionType?: string | null;
  compact?: boolean;
}

export function StatusBadge({ status, exceptionType, compact = false }: StatusBadgeProps) {
  const s = status as InvoiceStatus;
  const et = exceptionType as ExceptionType | null | undefined;

  // For exceptions, use exception-specific info if available
  if (s === "exception" && et && et in EXCEPTION_LABELS) {
    const variant = EXCEPTION_VARIANT[et] ?? "orange";
    const label = EXCEPTION_LABELS[et];
    const code = EXCEPTION_COMPACT[et] ?? "!";

    if (compact) {
      return (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded text-[10px] font-bold ${variantCompactClass(variant)}`}
          title={label}
        >
          {code}
        </span>
      );
    }
    return <Badge variant={variant}>{label}</Badge>;
  }

  const variant = STATUS_VARIANT[s] ?? "default";
  const label = STATUS_LABELS[s] ?? status;
  const code = STATUS_COMPACT[s] ?? "?";

  if (compact) {
    return (
      <span
        className={`inline-flex h-5 min-w-5 items-center justify-center rounded text-[10px] font-bold ${variantCompactClass(variant)}`}
        title={label}
      >
        {code}
      </span>
    );
  }

  return <Badge variant={variant}>{label}</Badge>;
}

/** Map badge variant to compact inline styling classes */
function variantCompactClass(variant: BadgeVariant): string {
  switch (variant) {
    case "success": return "bg-emerald-100 text-emerald-700";
    case "warning": return "bg-amber-100 text-amber-800";
    case "error": return "bg-red-100 text-red-700";
    case "info": return "bg-blue-100 text-blue-700";
    case "processing": return "bg-blue-100 text-blue-700";
    case "orange": return "bg-orange-100 text-orange-700";
    default: return "bg-gray-100 text-gray-700";
  }
}
