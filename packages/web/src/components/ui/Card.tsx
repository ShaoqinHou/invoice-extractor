import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/* ─── Card ─── */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-[#e5e7eb] bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/* ─── CardHeader ─── */
export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 border-b border-[#e5e7eb] px-6 py-4", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/* ─── CardContent ─── */
export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-6 py-4", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

/* ─── CardFooter ─── */
export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center border-t border-[#e5e7eb] px-6 py-4",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
