import { Badge, type BadgeVariant } from "../../../components/ui/Badge";

const TIER_LABELS: Record<number, string> = {
  1: "Text Layer",
  2: "Tesseract",
  3: "PaddleOCR",
};

const TIER_VARIANT: Record<number, BadgeVariant> = {
  1: "success",
  2: "info",
  3: "default",
};

export function OcrTierBadge({ tier }: { tier: number | null }) {
  if (!tier) return null;
  return (
    <Badge variant={TIER_VARIANT[tier] ?? "default"}>
      {TIER_LABELS[tier] ?? `Tier ${tier}`}
    </Badge>
  );
}
