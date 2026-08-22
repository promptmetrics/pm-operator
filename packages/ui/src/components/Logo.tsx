import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Operator identity, direction 1b of the Operator Identity design doc
// ("knocked out of a tile"): the PromptMetrics quatrefoil, solid cut, reversed
// out of an ink tile. The geometry is the parent brand's, unchanged — only
// weight and colour differ. The solid cut is deliberate: the hollow display cut
// drops below a hairline and disappears at favicon sizes.
//
// One path per blade, both subpaths in it, fill-rule evenodd to knock the inner
// petal out. Blades are inlined per instance rather than shared through
// <defs>/<use> as the design doc does — the lockup renders many times per page
// and the ids would collide.
const BLADE =
  "M2 -16 C -18 -78 24 -150 92 -160 C 150 -168 178 -120 162 -74 C 142 -24 56 -6 2 -16 Z " +
  "M58 -64 C 72 -96 110 -104 120 -84 C 128 -66 104 -44 80 -46 C 66 -47 54 -54 58 -64 Z";

const ROTATIONS = [0, 90, 180, 270];

export type OperatorMarkSize = "sm" | "md" | "lg";

// Tile / corner radius / mark size, from the size table in the design doc
// (radius ~22% of the tile, mark ~71%). Keep apps/web/app/icon.svg in step.
const markSizes: Record<OperatorMarkSize, { tile: string; radius: string; mark: number }> = {
  sm: { tile: "h-5 w-5", radius: "rounded-[5px]", mark: 14 },
  md: { tile: "h-8 w-8", radius: "rounded-[7px]", mark: 23 },
  lg: { tile: "h-12 w-12", radius: "rounded-[11px]", mark: 34 },
};

export interface OperatorMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: OperatorMarkSize;
}

export const OperatorMark = React.forwardRef<HTMLSpanElement, OperatorMarkProps>(
  ({ size = "md", className, ...props }, ref) => {
    const { tile, radius, mark } = markSizes[size];
    return (
      <span
        ref={ref}
        role="img"
        aria-label="Operator"
        className={cn(
          "inline-grid shrink-0 place-items-center bg-[var(--pm-ink)]",
          tile,
          radius,
          className
        )}
        {...props}
      >
        <svg
          viewBox="0 0 512 512"
          width={mark}
          height={mark}
          aria-hidden="true"
          className="fill-[var(--pm-paper)]"
        >
          <g transform="translate(256 256)">
            {ROTATIONS.map((deg) => (
              <path key={deg} d={BLADE} fillRule="evenodd" transform={`rotate(${deg})`} />
            ))}
          </g>
        </svg>
      </span>
    );
  }
);
OperatorMark.displayName = "OperatorMark";

export type OperatorLockupSize = "sm" | "md";

// Lockup per the mint redesign bundle (promptmetrics-community-portal-redesign,
// 2026-08-21): one brand name site-wide — a coral dot plus "Operator Stack" in
// Fraunces. The former mono "operator." prefix + serif "promptmetrics" split is
// retired (open decision 1: Operator Stack everywhere).
const lockupSizes: Record<
  OperatorLockupSize,
  { dot: string; gap: string; name: string }
> = {
  sm: { dot: "size-2", gap: "gap-2", name: "text-[13px]" },
  md: { dot: "size-2.5", gap: "gap-2.5", name: "text-xl" },
};

export interface OperatorLockupProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: OperatorLockupSize;
  /**
   * Extra classes for the serif "Operator Stack" wordmark only. The header uses
   * this to drop it below the sm breakpoint, leaving just the coral dot.
   */
  nameClassName?: string;
}

export const OperatorLockup = React.forwardRef<HTMLSpanElement, OperatorLockupProps>(
  ({ size = "md", className, nameClassName, ...props }, ref) => {
    const { dot, gap, name } = lockupSizes[size];
    return (
      <span ref={ref} className={cn("inline-flex items-center", gap, className)} {...props}>
        {/* Hidden from AT: the wordmark beside it already reads the name. */}
        <span
          aria-hidden="true"
          className={cn("inline-block shrink-0 rounded-full bg-[var(--pm-coral)]", dot)}
        />
        <span
          className={cn(
            "font-serif font-semibold tracking-[-0.01em] text-[var(--pm-ink)]",
            name,
            nameClassName
          )}
        >
          Operator Stack
        </span>
      </span>
    );
  }
);
OperatorLockup.displayName = "OperatorLockup";
