import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DateTileProps extends React.HTMLAttributes<HTMLDivElement> {
  month: string;
  day: string | number;
}

export const DateTile = React.forwardRef<HTMLDivElement, DateTileProps>(
  ({ month, day, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex w-[38px] shrink-0 flex-col items-center justify-center rounded-[var(--pm-radius-sm)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] py-1",
          className
        )}
        {...props}
      >
        <span className="text-[9px] font-bold uppercase leading-tight text-[var(--pm-coral-dark)]">
          {month}
        </span>
        <span className="text-[16px] font-semibold leading-tight text-[var(--pm-ink)] [font-family:var(--pm-font-serif)]">
          {day}
        </span>
      </div>
    );
  }
);
DateTile.displayName = "DateTile";
