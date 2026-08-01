import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type ButtonVariant = "primary" | "coral" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export function buttonVariants(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:pointer-events-none disabled:opacity-60";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-[var(--pm-coral)] text-[var(--pm-on-ink)] hover:bg-[var(--pm-coral-dark)] shadow-[var(--pm-shadow)]",
    coral:
      "bg-[var(--pm-coral)] text-[var(--pm-on-ink)] hover:bg-[var(--pm-coral-dark)] shadow-[var(--pm-shadow)]",
    secondary:
      "bg-[var(--pm-paper-2)] text-[var(--pm-ink)] border border-[var(--pm-line)] hover:bg-[var(--pm-paper-3)] hover:border-[var(--pm-line-2)]",
    ghost:
      "text-[var(--pm-ink)] hover:bg-[var(--pm-paper-2)]",
    danger:
      "bg-[var(--pm-danger)] text-[var(--pm-on-ink)] hover:bg-[var(--pm-danger)]/90 shadow-[var(--pm-shadow)]",
  };

  const sizes: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-base",
    lg: "h-12 px-6 text-lg",
  };

  return twMerge(clsx(base, variants[variant], sizes[size]));
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={twMerge(clsx(buttonVariants(variant, size), className))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
