import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type InputVariant = "default" | "error";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
  error?: string;
  helperText?: string;
  inputId?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = "default",
      label,
      error,
      helperText,
      inputId,
      className,
      startIcon,
      endIcon,
      ...props
    },
    ref,
  ) => {
    const id = inputId ?? props.id;
    const resolvedVariant = error ? "error" : variant;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-[#1a1a2e]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {startIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]">
              {startIcon}
            </span>
          )}
          <input
            ref={ref}
            id={id}
            className={cn(
              "w-full rounded border px-3 py-2 text-sm text-[#1a1a2e] placeholder:text-[#6b7280] transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              resolvedVariant === "error"
                ? "border-[#ef4444] focus:border-[#ef4444] focus:ring-[#ef4444]/20"
                : "border-[#e5e7eb] focus:border-[#0078c8] focus:ring-[#0078c8]/20",
              "disabled:bg-gray-50 disabled:text-[#6b7280] disabled:cursor-not-allowed",
              startIcon && "pl-10",
              endIcon && "pr-10",
              className,
            )}
            aria-invalid={resolvedVariant === "error" ? true : undefined}
            aria-describedby={
              error ? `${id}-error` : helperText ? `${id}-helper` : undefined
            }
            {...props}
          />
          {endIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280]">
              {endIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${id}-error`} className="text-sm text-[#ef4444]" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${id}-helper`} className="text-sm text-[#6b7280]">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
