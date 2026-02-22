import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "./keys";
import { API_BASE } from "@web/lib/api";

interface UploadResult {
  id: number;
  display_name: string;
}

interface DuplicateError {
  isDuplicate: true;
  existing_id: number;
  existing_name: string;
  filename: string;
}

export function useUpload() {
  const queryClient = useQueryClient();

  return useMutation<UploadResult, DuplicateError | Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      // Do NOT set Content-Type — let browser set multipart boundary
      const res = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        body: formData,
      });

      if (res.status === 409) {
        const data = await res.json();
        const err: DuplicateError = {
          isDuplicate: true,
          existing_id: data.existing_id,
          existing_name: data.existing_name,
          filename: file.name,
        };
        throw err;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function isDuplicateError(err: unknown): err is DuplicateError {
  return typeof err === "object" && err !== null && "isDuplicate" in err;
}
