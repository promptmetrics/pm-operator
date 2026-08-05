'use client';

import clsx from 'clsx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-[var(--pm-muted)]">{icon}</div>
      )}

      <h3 className="text-base font-semibold text-[var(--pm-ink)]">
        {title}
      </h3>

      {message && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--pm-muted)]">
          {message}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={clsx(
            'mt-5 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]',
            'hover:opacity-90 transition-opacity'
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
