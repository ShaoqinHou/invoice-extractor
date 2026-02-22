const TIER_LABELS: Record<number, string> = {
  1: 'Text Layer',
  2: 'Tesseract',
  3: 'PaddleOCR',
};

const TIER_STYLES: Record<number, string> = {
  1: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  2: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  3: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

export function OcrTierBadge({ tier }: { tier: number | null }) {
  if (!tier) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLES[tier] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {TIER_LABELS[tier] ?? `Tier ${tier}`}
    </span>
  );
}
