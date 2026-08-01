import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  value: React.ReactNode;
  label: string;
  icon?: React.ReactNode;
}

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ value, label, icon, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]",
          className
        )}
        {...props}
      >
        {icon ? (
          <span aria-hidden="true" className="shrink-0 text-[var(--pm-coral)]">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="text-[24px] font-semibold leading-tight text-[var(--pm-ink)] [font-family:var(--pm-font-serif)]">
            {value}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pm-muted)]">
            {label}
          </div>
        </div>
      </div>
    );
  }
);
StatCard.displayName = "StatCard";
