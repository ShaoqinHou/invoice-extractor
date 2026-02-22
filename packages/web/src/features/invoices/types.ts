export type InvoiceStatus =
  | "queued"
  | "uploading"
  | "extracting"
  | "processing"
  | "verifying"
  | "draft"
  | "exception"
  | "approved"
  | "complete"
  | "error";

export type ExceptionType = "scan_quality" | "investigate" | "value_mismatch";

export interface Invoice {
  id: number;
  original_filename: string;
  display_name: string;
  file_path: string;
  upload_date: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  currency: string;
  notes: string | null;
  raw_extracted_text: string | null;
  raw_llm_response: string | null;
  status: InvoiceStatus;
  error_message: string | null;
  gst_number: string | null;
  due_date: string | null;
  exception_type: ExceptionType | null;
  exception_details: string | null;
  file_hash: string | null;
  ocr_tier: number | null;
  approved_date: string | null;
  total_amount: number | null;
  gst_amount: number | null;
}

export interface InvoiceEntry {
  id: number;
  invoice_id: number;
  label: string;
  amount: number | null;
  entry_type: string | null;
  attrs: Record<string, unknown> | null;
  sort_order: number;
}

export interface InvoiceWithEntries extends Invoice {
  entries: InvoiceEntry[];
}
