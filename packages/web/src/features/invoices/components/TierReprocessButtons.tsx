import { useState, useRef, useEffect } from "react";
import { useReprocess } from "../hooks/useReprocess";
import { ChevronDown } from "lucide-react";

interface TierReprocessButtonsProps {
  invoiceId: number;
  currentTier: number | null;
  onReprocessed?: () => void;
}

export function TierReprocessButtons({ invoiceId, currentTier, onReprocessed }: TierReprocessButtonsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { mutate, isPending } = useReprocess();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleReprocess(tier: 2 | 3) {
    setOpen(false);
    mutate({ id: invoiceId, tier }, {
      onSuccess: () => onReprocessed?.(),
      onError: (err) => alert(err.message || "Reprocess failed."),
    });
  }

  if (currentTier === 3) return null;

  const options: { tier: 2 | 3; label: string }[] = [];
  if (currentTier === 1 || !currentTier) {
    options.push({ tier: 2, label: "Tesseract" });
  }
  options.push({ tier: 3, label: "PaddleOCR" });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {isPending ? "Reprocessing..." : "Reprocess"}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 min-w-[140px] rounded border border-gray-200 bg-white py-1 shadow-lg">
          {options.map(opt => (
            <button
              key={opt.tier}
              onClick={() => handleReprocess(opt.tier)}
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
