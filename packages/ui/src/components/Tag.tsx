import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ color = "var(--pm-coral)", className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
          className
        )}
        style={{
          borderColor: color,
          color: color,
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        }}
        {...props}
      />
    );
  }
);
Tag.displayName = "Tag";
