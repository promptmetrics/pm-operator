'use client';

import { BarChart3 } from 'lucide-react';
import type { AdminDashboardTrendPoint } from '@pm-operator/api';
import EmptyState from './EmptyState';
import { weekdayLabel } from './dashboard-metrics';

export interface PostsPerDayChartProps {
  points: AdminDashboardTrendPoint[];
}

const TRACK_HEIGHT_PX = 96;

/**
 * Seven-day posts-per-day bars.
 *
 * SparklineChart is deliberately not reused here: it draws one aria-hidden
 * polyline and bails out below two points, so it can carry neither the per-day
 * labels nor the counts this panel is meant to expose. Bars are plain divs —
 * no charting dependency.
 */
export default function PostsPerDayChart({ points }: PostsPerDayChartProps) {
  if (points.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-8 w-8" aria-hidden="true" />}
        title="No activity yet"
        message="Posts published in the last seven days will show up here."
        className="py-6"
      />
    );
  }

  // Scale to the busiest day so a quiet week still reads as a shape rather than
  // seven full-height bars.
  const peak = Math.max(...points.map((point) => point.count), 1);

  return (
    <ul aria-label="Posts per day" className="flex items-end gap-2 sm:gap-3">
      {points.map((point) => {
        const isEmpty = point.count === 0;
        // Empty days keep a visible stub so the day still has a footprint.
        const heightPx = isEmpty
          ? 2
          : Math.max(4, Math.round((point.count / peak) * TRACK_HEIGHT_PX));

        return (
          <li
            key={point.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <span className="text-xs font-medium text-[var(--pm-ink)]">
              {point.count}
            </span>

            <div
              className="flex w-full items-end justify-center"
              style={{ height: TRACK_HEIGHT_PX }}
            >
              <div
                className="w-full max-w-10 rounded-t-md"
                style={{
                  height: heightPx,
                  backgroundColor: isEmpty
                    ? 'var(--pm-line-2)'
                    : 'var(--pm-teal)',
                }}
              />
            </div>

            <span className="text-xs text-[var(--pm-muted)]">
              {weekdayLabel(point.date)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
