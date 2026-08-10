import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface PodiumCardProps extends React.HTMLAttributes<HTMLDivElement> {
  rank: number;
  name: string;
  subtitle?: string;
  score: string;
  avatar?: React.ReactNode;
  highlight?: boolean;
  badge?: string;
}

// Reference podium: a medal emoji sits above each avatar instead of a rank
// number; `rank` stays for the aria label and the caller's data attributes.
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export const PodiumCard = React.forwardRef<HTMLDivElement, PodiumCardProps>(
  ({ rank, name, subtitle, score, avatar, highlight = false, badge, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-[var(--pm-radius-lg)] border bg-[var(--pm-paper-inset)] text-center",
          highlight
            ? "border-[var(--pm-line-2)] p-6 shadow-[var(--pm-shadow-lg)]"
            : "border-[var(--pm-line)] p-4 shadow-[var(--pm-shadow)]",
          className
        )}
        {...props}
      >
        <span aria-label={`Rank ${rank}`} role="img" className="text-xl leading-none">
          {MEDALS[rank] ?? rank}
        </span>

        {avatar}

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--pm-ink)]">{name}</div>
          {subtitle ? (
            <div className="truncate text-xs text-[var(--pm-muted)]">{subtitle}</div>
          ) : null}
        </div>

        <div className="text-[16px] font-semibold leading-tight text-[var(--pm-ink)] [font-family:var(--pm-font-serif)]">
          {score}
        </div>

        {/* "⭐ Operator of the week" pill sits BELOW the points. */}
        {badge ? (
          <span className="inline-flex items-center rounded-[var(--pm-radius-pill)] bg-[var(--pm-coral-tint)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--pm-coral-dark)]">
            {badge}
          </span>
        ) : null}
      </div>
    );
  }
);
PodiumCard.displayName = "PodiumCard";
