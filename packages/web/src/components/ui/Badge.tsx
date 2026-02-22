import { type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "processing" | "orange";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  processing: "bg-blue-100 text-blue-700",
  orange: "bg-orange-100 text-orange-700",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
