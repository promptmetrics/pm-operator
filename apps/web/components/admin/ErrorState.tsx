'use client';

import clsx from 'clsx';
import { AlertTriangle, WifiOff, ShieldOff } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  variant?: 'error' | 'network' | 'permission';
  className?: string;
}

const variantConfig = {
  error: {
    icon: AlertTriangle,
    defaultTitle: 'Something went wrong',
  },
  network: {
    icon: WifiOff,
    defaultTitle: 'Network error',
  },
  permission: {
    icon: ShieldOff,
    defaultTitle: 'Permission denied',
  },
} as const;

export default function ErrorState({
  title,
  message,
  error,
  onRetry,
  variant = 'error',
  className,
}: ErrorStateProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  const resolvedTitle = title ?? config.defaultTitle;

  const resolvedMessage =
    message ??
    (error
      ? typeof error === 'string'
        ? error
        : error.message
      : undefined);

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border px-6 py-10 text-center',
        'border-[var(--pm-danger)]',
        className
      )}
      role="alert"
      style={{ backgroundColor: 'var(--pm-danger-bg)' }}
    >
      <Icon
        className="mb-4 h-10 w-10"
        style={{ color: 'var(--pm-danger)' }}
        aria-hidden="true"
      />

      <h3
        className="text-base font-semibold"
        style={{ color: 'var(--pm-danger)' }}
      >
        {resolvedTitle}
      </h3>

      {resolvedMessage && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--pm-muted)]">
          {resolvedMessage}
        </p>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className={clsx(
            'mt-5 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-[var(--pm-danger)] text-white',
            'hover:opacity-90 transition-opacity'
          )}
        >
          Try again
        </button>
      )}
    </div>
  );
}
