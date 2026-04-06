import { useReprocess } from "../hooks/useReprocess";

interface TierReprocessButtonsProps {
  invoiceId: number;
  currentTier: number | null;
  onReprocessed?: () => void;
}

export function TierReprocessButtons({ invoiceId, onReprocessed }: TierReprocessButtonsProps) {
  const { mutate, isPending } = useReprocess();

  function handleReprocess() {
    mutate({ id: invoiceId }, {
      onSuccess: () => onReprocessed?.(),
      onError: (err) => alert(err.message || "Reprocess failed."),
    });
  }

  return (
    <button
      onClick={handleReprocess}
      disabled={isPending}
      className="inline-flex items-center rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
    >
      {isPending ? "Reprocessing..." : "Reprocess"}
    </button>
  );
}
