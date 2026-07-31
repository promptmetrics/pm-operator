import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type BadgeVariant =
  | "default"
  | "indigo"
  | "rose"
  | "emerald"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function badgeVariants(variant: BadgeVariant = "default"): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  const variants: Record<BadgeVariant, string> = {
    default:
      "border-transparent bg-muted text-foreground hover:bg-paper-200",
    indigo:
      "border-transparent bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
    rose:
      "border-transparent bg-rose-100 text-rose-800 hover:bg-rose-200",
    emerald:
      "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
    outline:
      "border-border text-foreground hover:bg-muted",
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
