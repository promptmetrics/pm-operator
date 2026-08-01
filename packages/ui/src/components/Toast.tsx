"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ToastVariant = "default" | "success" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "title">> {
  id: number;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 4;
const DEFAULT_DURATION = 4000;

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return context;
}

const variantAccent: Record<ToastVariant, string> = {
  default: "border-l-[var(--pm-line-2)]",
  success: "border-l-[var(--pm-green)]",
  error: "border-l-[var(--pm-danger)]",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const idRef = React.useRef(0);
  const timersRef = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  React.useEffect(() => {
    setMounted(true);
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismiss = React.useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, variant = "default", duration = DEFAULT_DURATION }: ToastOptions) => {
      const id = ++idRef.current;
      setToasts((current) => [...current, { id, title, description, variant }].slice(-MAX_TOASTS));
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
    },
    [dismiss]
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
            >
              {toasts.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] border-l-4 bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow-lg)]",
                    variantAccent[item.variant]
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--pm-ink)]">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-[var(--pm-muted)]">{item.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => dismiss(item.id)}
                    className="shrink-0 rounded-[var(--pm-radius-xs)] p-0.5 text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)] focus:outline-none focus-visible:shadow-[var(--pm-focus)]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}
