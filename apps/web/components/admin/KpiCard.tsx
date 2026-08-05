'use client';

import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

export interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  change?: string;
  icon?: LucideIcon;
  className?: string;
}

export default function KpiCard({
  title,
  value,
  trend,
  change,
  icon: Icon,
  className,
}: KpiCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-green-600'
      : trend === 'down'
        ? 'text-[var(--pm-danger)]'
        : 'text-[var(--pm-muted)]';

  return (
    <div
      className={clsx(
        'flex flex-col gap-1.5 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--pm-muted)]">
          {title}
        </span>
        {Icon && (
          <Icon className="h-4 w-4 text-[var(--pm-coral)]" aria-hidden="true" />
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[var(--pm-ink)]">{value}</span>

        {(trend || change) && (
          <span className={clsx('flex items-center gap-0.5 text-sm font-medium', trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {change}
          </span>
        )}
      </div>
    </div>
  );
}
