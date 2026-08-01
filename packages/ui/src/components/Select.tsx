import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { ChevronDown } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  description?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ id, label, error, description, className, children, ...props }, ref) => {
    const selectId = id ?? React.useId();
    const errorId = `${selectId}-error`;
    const descriptionId = `${selectId}-description`;

    const ariaDescribedBy =
      [description ? descriptionId : null, error ? errorId : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <LabelPrimitive.Root
            htmlFor={selectId}
            className="text-sm font-medium text-[var(--pm-ink)]"
          >
            {label}
          </LabelPrimitive.Root>
        ) : null}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={ariaDescribedBy}
            className={cn(
              "flex h-10 w-full appearance-none rounded-lg border bg-[var(--pm-paper-inset)] px-3 py-2 pr-9 text-base text-[var(--pm-ink)] transition-colors focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:cursor-not-allowed disabled:opacity-60",
              error
                ? "border-[var(--pm-danger)]"
                : "border-[var(--pm-line)] hover:border-[var(--pm-line-2)]",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pm-muted)]"
          />
        </div>

        {description ? (
          <p id={descriptionId} className="text-sm text-[var(--pm-muted)]">
            {description}
          </p>
        ) : null}

        {error ? (
          <p id={errorId} className="text-sm text-[var(--pm-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";
