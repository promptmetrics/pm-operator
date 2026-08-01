"use client";

import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(`<${component}> must be used within <Tabs>`);
  }
  return context;
}

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
}

export function Tabs({ value, onValueChange, className, children, ...props }: TabsProps) {
  const baseId = React.useId();
  const context = React.useMemo(
    () => ({ value, onValueChange, baseId }),
    [value, onValueChange, baseId]
  );
  return (
    <TabsContext.Provider value={context}>
      <div className={cn("flex flex-col", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn("flex items-center gap-1 border-b border-[var(--pm-line)]", className)}
      {...props}
    />
  )
);
TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className, onKeyDown, ...props }, ref) => {
    const context = useTabsContext("TabsTrigger");
    const selected = context.value === value;
    const slug = slugify(value);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const tablist = event.currentTarget.closest('[role="tablist"]');
      if (!tablist) return;
      const tabs = Array.from(
        tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
      );
      const currentIndex = tabs.indexOf(event.currentTarget);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const next = tabs[nextIndex];
      next.focus();
      next.click();
    };

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={`${context.baseId}-tab-${slug}`}
        aria-selected={selected}
        aria-controls={`${context.baseId}-panel-${slug}`}
        tabIndex={selected ? 0 : -1}
        onClick={() => context.onValueChange(value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:pointer-events-none disabled:opacity-60",
          selected
            ? "border-[var(--pm-coral)] font-semibold text-[var(--pm-ink)]"
            : "border-transparent text-[var(--pm-muted)] hover:text-[var(--pm-ink)]",
          className
        )}
        {...props}
      />
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className, ...props }, ref) => {
    const context = useTabsContext("TabsContent");
    const selected = context.value === value;
    const slug = slugify(value);

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${context.baseId}-panel-${slug}`}
        aria-labelledby={`${context.baseId}-tab-${slug}`}
        hidden={!selected}
        tabIndex={0}
        className={cn("pt-4 focus:outline-none focus-visible:shadow-[var(--pm-focus)]", className)}
        {...props}
      />
    );
  }
);
TabsContent.displayName = "TabsContent";
