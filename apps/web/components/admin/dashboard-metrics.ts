import type {
  AdminDashboardNullableWindow,
  AdminDashboardWindow,
} from '@pm-operator/api';
import type { KpiDelta } from './KpiCard';

/**
 * Presentation maths for the admin dashboard KPI tiles (analytics v2, §4.5).
 *
 * The contract models "no qualifying rows in that window" as `null` rather than
 * 0 — a week with no questions asked has no solved rate, which is a different
 * statement from a solved rate of 0%. These helpers keep that distinction all
 * the way to the screen: a missing window produces a `direction: 'none'` delta
 * that renders as an authored phrase with no arrow, never as "0%".
 */

const VS_PRIOR = 'vs. prior week';

const NO_PRIOR_WINDOW: KpiDelta = {
  direction: 'none',
  tone: 'neutral',
  label: 'No prior week to compare',
};

const NO_CURRENT_WINDOW: KpiDelta = {
  direction: 'none',
  tone: 'neutral',
  label: 'No data this week',
};

const NO_CHANGE: KpiDelta = {
  direction: 'flat',
  tone: 'neutral',
  label: 'No change',
  caption: VS_PRIOR,
};

/** Human-readable duration: "45s", "12m", "4h 12m", "2d 3h". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

/** A 0..1 rate as a whole percentage. */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Week-over-week change for a plain count.
 *
 * A prior week of 0 is a real measurement, not a missing one, but the percentage
 * against it is undefined — so the absolute gain is shown instead of dividing
 * by zero.
 */
export function countDelta(window: AdminDashboardWindow): KpiDelta {
  const { current, prior } = window;
  const diff = current - prior;

  if (diff === 0) return NO_CHANGE;

  if (prior === 0) {
    return {
      direction: 'up',
      tone: 'positive',
      label: `+${current}`,
      caption: 'vs. 0 last week',
    };
  }

  const percent = Math.abs(Math.round((diff / prior) * 100));
  return {
    direction: diff > 0 ? 'up' : 'down',
    tone: diff > 0 ? 'positive' : 'negative',
    label: `${diff > 0 ? '+' : '-'}${percent}%`,
    caption: VS_PRIOR,
  };
}

/**
 * Week-over-week change for a 0..1 rate, expressed in percentage points — the
 * honest comparison for a ratio, since "up 50%" is ambiguous between 4%→6% and
 * 40%→60%.
 */
export function rateDelta(window: AdminDashboardNullableWindow): KpiDelta {
  const { current, prior } = window;
  if (prior === null) return NO_PRIOR_WINDOW;
  if (current === null) return NO_CURRENT_WINDOW;

  const points = Math.round((current - prior) * 100);
  if (points === 0) return NO_CHANGE;

  return {
    direction: points > 0 ? 'up' : 'down',
    tone: points > 0 ? 'positive' : 'negative',
    label: `${points > 0 ? '+' : '-'}${Math.abs(points)} pts`,
    caption: VS_PRIOR,
  };
}

/**
 * Week-over-week change for a duration. Direction and tone deliberately
 * disagree: answering faster means the number went *down*, which is the good
 * outcome.
 */
export function durationDelta(window: AdminDashboardNullableWindow): KpiDelta {
  const { current, prior } = window;
  if (prior === null) return NO_PRIOR_WINDOW;
  if (current === null) return NO_CURRENT_WINDOW;

  const diff = Math.round(current - prior);
  if (diff === 0) return NO_CHANGE;

  return {
    direction: diff > 0 ? 'up' : 'down',
    tone: diff > 0 ? 'negative' : 'positive',
    label: `${diff > 0 ? '+' : '-'}${formatDuration(Math.abs(diff))}`,
    caption: VS_PRIOR,
  };
}

/** Tile value for a window whose current side may be absent. */
export function nullableValue(
  current: number | null,
  format: (value: number) => string
): string {
  return current === null ? 'No data' : format(current);
}

/**
 * Weekday label for a `YYYY-MM-DD` bucket. Parsed as local midnight rather than
 * via `new Date('YYYY-MM-DD')`, which UTC-parses and can shift the label a day
 * for admins west of UTC.
 */
export function weekdayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { weekday: 'short' });
}
