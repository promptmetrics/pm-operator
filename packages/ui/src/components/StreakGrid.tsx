import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type StreakDayState = "done" | "pending" | "empty";

export interface StreakDay {
  label: string;
  state: StreakDayState;
}

export interface StreakGridProps extends React.HTMLAttributes<HTMLDivElement> {
  days: StreakDay[];
}

const stateClasses: Record<StreakDayState, string> = {
  done: "bg-[var(--pm-coral)]",
  pending: "border border-dashed border-[var(--pm-coral)] bg-[var(--pm-coral-tint)]",
  empty: "bg-[var(--pm-paper-3)]",
};

const stateText: Record<StreakDayState, string> = {
  done: "done",
  pending: "pending",
  empty: "no activity",
};

export const StreakGrid = React.forwardRef<HTMLDivElement, StreakGridProps>(
  ({ days, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("flex w-full gap-1", className)} {...props}>
        {days.map((day, index) => (
          <div
            key={`${day.label}-${index}`}
            title={day.label}
            className={cn(
              "h-[30px] flex-1 rounded-[var(--pm-radius-xs)]",
              stateClasses[day.state]
            )}
          >
            <span className="sr-only">{`${day.label}: ${stateText[day.state]}`}</span>
          </div>
        ))}
      </div>
    );
  }
);
StreakGrid.displayName = "StreakGrid";
