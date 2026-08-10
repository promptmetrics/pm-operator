import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type LevelBadgeSize = "xs" | "sm" | "md";

export interface LevelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: number;
  size?: LevelBadgeSize;
}

const sizeClasses: Record<LevelBadgeSize, string> = {
  xs: "h-[10px] w-[10px] text-[7px]",
  sm: "h-[15px] w-[15px] text-[9px]",
  md: "h-[18px] w-[18px] text-[10px]",
};

export const LevelBadge = React.forwardRef<HTMLSpanElement, LevelBadgeProps>(
  ({ level, size = "sm", className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        aria-label={`Level ${level}`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--pm-paper-inset)] bg-[var(--pm-ink)] font-extrabold leading-none text-[var(--pm-on-ink)]",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {level}
      </span>
    );
  }
);
LevelBadge.displayName = "LevelBadge";
