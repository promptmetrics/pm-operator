import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  swatch?: string;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ active = false, swatch, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={active}
        className={cn(
          "inline-flex h-[30px] items-center gap-1.5 rounded-[var(--pm-radius-pill)] px-3 text-sm transition-colors focus:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:pointer-events-none disabled:opacity-60",
          active
            ? "bg-[var(--pm-coral-tint)] font-semibold text-[var(--pm-coral-dark)]"
            : "text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)]",
          className
        )}
        {...props}
      >
        {swatch ? (
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: swatch }}
          />
        ) : null}
        {children}
      </button>
    );
  }
);
Chip.displayName = "Chip";
