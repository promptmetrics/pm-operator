import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  src?: string;
  alt: string;
  fallback?: string;
  size?: AvatarSize;
  badge?: React.ReactNode;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, src, alt, fallback, size = "md", badge, ...props }, ref) => {
  const avatar = (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-[var(--pm-paper-2)]",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      <AvatarPrimitive.Image
        src={src}
        alt={alt}
        className="aspect-square h-full w-full object-cover"
      />
      <AvatarPrimitive.Fallback
        delayMs={src ? 600 : 0}
        className="flex h-full w-full items-center justify-center bg-[var(--pm-paper-3)] font-medium text-[var(--pm-ink)]"
        aria-label={fallback ? `${fallback} avatar` : alt}
      >
        {fallback ? initialsFromName(fallback) : alt.slice(0, 2).toUpperCase()}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );

  if (!badge) return avatar;

  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span className="absolute -bottom-1 -right-1">{badge}</span>
    </span>
  );
});
Avatar.displayName = "Avatar";

export const AvatarFallback = AvatarPrimitive.Fallback;
