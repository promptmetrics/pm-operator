import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  description?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id, label, error, description, className, ...props }, ref) => {
    const inputId = id ?? React.useId();
    const errorId = `${inputId}-error`;
    const descriptionId = `${inputId}-description`;

    const ariaDescribedBy =
      [description ? descriptionId : null, error ? errorId : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <LabelPrimitive.Root
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--pm-ink)]"
          >
            {label}
          </LabelPrimitive.Root>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "flex h-10 w-full rounded-lg border bg-[var(--pm-paper-inset)] px-3 py-2 text-base text-[var(--pm-ink)] transition-colors placeholder:text-[var(--pm-muted-soft)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:cursor-not-allowed disabled:opacity-60",
            error
              ? "border-[var(--pm-danger)]"
              : "border-[var(--pm-line)] hover:border-[var(--pm-line-2)]",
            className
          )}
          {...props}
        />

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
Input.displayName = "Input";
