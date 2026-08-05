'use client';

import clsx from 'clsx';

export interface LoadingStateProps {
  rows?: number;
  type?: 'table' | 'card' | 'text';
  message?: string;
  className?: string;
}

export default function LoadingState({
  rows = 5,
  type = 'table',
  message,
  className,
}: LoadingStateProps) {
  const items = Array.from({ length: rows });

  const renderTableSkeleton = () => (
    <div className="overflow-x-auto rounded-lg border border-[var(--pm-line)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--pm-line)] bg-[var(--pm-paper-inset)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <th key={i} className="px-3 py-3 text-left">
                <div className="h-3 w-20 rounded bg-[var(--pm-line)] animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--pm-line)]">
          {items.map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: 4 }).map((_, colIdx) => (
                <td key={colIdx} className="px-3 py-3">
                  <div
                    className={clsx(
                      'h-4 rounded animate-pulse',
                      colIdx === 0 ? 'w-3/4' : 'w-1/2'
                    )}
                    style={{ backgroundColor: 'var(--pm-paper-2)' }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCardSkeleton = () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--pm-line)] p-4 space-y-3"
        >
          <div
            className="h-4 w-2/3 rounded animate-pulse"
            style={{ backgroundColor: 'var(--pm-paper-2)' }}
          />
          <div
            className="h-3 w-full rounded animate-pulse"
            style={{ backgroundColor: 'var(--pm-paper-2)' }}
          />
          <div
            className="h-3 w-5/6 rounded animate-pulse"
            style={{ backgroundColor: 'var(--pm-paper-2)' }}
          />
          <div className="flex gap-2 pt-1">
            <div
              className="h-8 w-20 rounded-md animate-pulse"
              style={{ backgroundColor: 'var(--pm-paper-2)' }}
            />
            <div
              className="h-8 w-20 rounded-md animate-pulse"
              style={{ backgroundColor: 'var(--pm-paper-2)' }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  const renderTextSkeleton = () => (
    <div className="space-y-3">
      {items.map((_, i) => (
        <div
          key={i}
          className={clsx(
            'h-3 rounded animate-pulse',
            i % 3 === 0 ? 'w-full' : i % 3 === 1 ? 'w-5/6' : 'w-4/6'
          )}
          style={{ backgroundColor: 'var(--pm-paper-2)' }}
        />
      ))}
    </div>
  );

  return (
    <div className={clsx('w-full', className)} role="status" aria-label="Loading">
      {type === 'table' && renderTableSkeleton()}
      {type === 'card' && renderCardSkeleton()}
      {type === 'text' && renderTextSkeleton()}

      {message && (
        <p className="mt-3 text-center text-sm text-[var(--pm-muted)]">
          {message}
        </p>
      )}
    </div>
  );
}
