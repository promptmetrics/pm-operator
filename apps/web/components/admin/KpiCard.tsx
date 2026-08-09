'use client';

import clsx from 'clsx';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

/**
 * Which way the number actually moved. `none` means the two windows are not
 * comparable (no prior week, or no qualifying data this week) — it renders as a
 * plain muted caption with no arrow, so "nothing to compare" never reads as a
 * 0% change.
 */
export type KpiDeltaDirection = 'up' | 'down' | 'flat' | 'none';

/**
 * Whether the movement is good or bad, which is not the same as its direction:
 * time-to-first-answer going *down* is the good case.
 */
export type KpiDeltaTone = 'positive' | 'negative' | 'neutral';

export interface KpiDelta {
  direction: KpiDeltaDirection;
  tone: KpiDeltaTone;
  /** Signed magnitude, e.g. "+18%", "-4h 12m", or an authored phrase. */
  label: string;
  /** Comparison caption, e.g. "vs. prior week". */
  caption?: string;
}

export interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  change?: string;
  /**
   * Week-over-week comparison. Additive: when omitted the card renders exactly
   * as it always has from `trend` / `change`.
   */
  delta?: KpiDelta;
  icon?: LucideIcon;
  className?: string;
}

const deltaToneClass: Record<KpiDeltaTone, string> = {
  positive: 'text-[var(--pm-green)]',
  negative: 'text-[var(--pm-danger)]',
  neutral: 'text-[var(--pm-muted)]',
};

const deltaDirectionIcon: Record<
  Exclude<KpiDeltaDirection, 'none'>,
  LucideIcon
> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export default function KpiCard({
  title,
  value,
  trend,
  change,
  delta,
  icon: Icon,
  className,
}: KpiCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const DeltaIcon =
    delta && delta.direction !== 'none' ? deltaDirectionIcon[delta.direction] : null;
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

        {!delta && (trend || change) && (
          <span className={clsx('flex items-center gap-0.5 text-sm font-medium', trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {change}
          </span>
        )}

        {DeltaIcon && delta && (
          <span
            className={clsx(
              'flex items-center gap-0.5 text-sm font-medium',
              deltaToneClass[delta.tone],
            )}
          >
            <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {delta.label}
          </span>
        )}
      </div>

      {/* `none` has no arrow, so its phrase is the caption itself. */}
      {delta && (delta.direction === 'none' ? delta.label : delta.caption) && (
        <span className="text-xs text-[var(--pm-muted)]">
          {delta.direction === 'none' ? delta.label : delta.caption}
        </span>
      )}
    </div>
  );
}
