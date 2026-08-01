import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  label?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, label, className, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    const labelId = React.useId();

    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label ? (
          <span id={labelId} className="text-sm font-medium text-[var(--pm-ink)]">
            {label}
          </span>
        ) : null}
        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-labelledby={label ? labelId : undefined}
          className="h-2 w-full overflow-hidden rounded-[var(--pm-radius-pill)] bg-[var(--pm-paper-3)]"
          {...props}
        >
          <div
            className="h-full rounded-[var(--pm-radius-pill)] bg-[var(--pm-coral)] transition-[width]"
            style={{ width: `${clamped}%` }}
          />
        </div>
      </div>
    );
  }
);
Progress.displayName = "Progress";
