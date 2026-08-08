import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type BadgeVariant =
  | "default"
  | "coral"
  | "green"
  | "teal"
  | "amber"
  | "blue"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function badgeVariants(variant: BadgeVariant = "default"): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:shadow-[var(--pm-focus)]";

  const variants: Record<BadgeVariant, string> = {
    default:
      "border-transparent bg-[var(--pm-paper-2)] text-[var(--pm-ink)] hover:bg-[var(--pm-paper-3)]",
    coral:
      "border-transparent bg-[var(--pm-coral-tint)] text-[var(--pm-coral-dark)] hover:bg-[var(--pm-coral-tint-10)]",
    green:
      "border-transparent bg-[var(--pm-green-bg)] text-[var(--pm-green)] hover:bg-[var(--pm-green-line)]",
    teal:
      "border-transparent bg-[color-mix(in_srgb,var(--pm-teal)_14%,transparent)] text-[var(--pm-teal-dark)] hover:bg-[color-mix(in_srgb,var(--pm-teal)_22%,transparent)]",
    amber:
      "border-transparent bg-[var(--pm-amber-bg)] text-[var(--pm-amber)] hover:bg-[var(--pm-amber-line)]",
    blue:
      "border-transparent bg-[var(--pm-blue-bg)] text-[var(--pm-blue)] hover:bg-[var(--pm-blue-bg)]/80",
    outline:
      "border-[var(--pm-line)] text-[var(--pm-ink)] hover:bg-[var(--pm-paper-2)]",
  };

  return cn(base, variants[variant]);
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants(variant), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";
