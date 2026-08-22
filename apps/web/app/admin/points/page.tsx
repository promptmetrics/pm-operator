import * as React from 'react';
import {
  DAILY_CAPS,
  OPERATOR_LEVELS,
  POINT_WEIGHTS,
  PointEventType,
} from '@pm-operator/api';
import { Card } from '@pm-operator/ui/components/Card';
import AwardPointsForm from './AwardPointsForm';

/**
 * Display rows for the canonical economy. Cap copy is derived from DAILY_CAPS
 * where a cap exists; the weights themselves always render from POINT_WEIGHTS
 * so this table can never drift from the code that awards points.
 */
const WEIGHT_ROWS: { event: keyof typeof POINT_WEIGHTS; label: string; cap: string }[] = [
  { event: PointEventType.TOPIC_CREATED, label: 'Post created', cap: 'Uncapped' },
  { event: PointEventType.COMMENT_CREATED, label: 'Comment created', cap: 'Uncapped' },
  { event: PointEventType.SOLUTION_ACCEPTED, label: 'Solution accepted', cap: 'Uncapped' },
  { event: PointEventType.LIKE_RECEIVED, label: 'Like received', cap: 'Uncapped' },
  {
    event: PointEventType.LIKE_GIVEN,
    label: 'Like given',
    cap: `${DAILY_CAPS.likesGivenCount}/day (${DAILY_CAPS.likesGivenPoints} pts/day)`,
  },
  { event: PointEventType.INVITE_ACCEPTED, label: 'Invite accepted', cap: 'Uncapped' },
  { event: PointEventType.DAILY_VISIT, label: 'Daily visit', cap: '1/day' },
  {
    event: PointEventType.POSTS_READ,
    label: 'Posts read',
    cap: `${DAILY_CAPS.postsReadCount}/day (${DAILY_CAPS.postsReadPoints} pts/day)`,
  },
  {
    event: PointEventType.STREAK_BONUS,
    label: 'Daily streak bonus',
    cap: `${DAILY_CAPS.streakBonusMaxDays} consecutive days`,
  },
];

export default function AdminPointsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Point economy — read-only: the weights are compile-time constants,
          not DB rows, so there is nothing to edit here. */}
      <h1 className="mb-1 text-2xl font-semibold">Point economy</h1>
      <p className="mb-6 text-sm text-[var(--pm-muted)]">
        Weights are canonical — displayed copy is generated from this table.
      </p>

      <Card className="mb-2 overflow-hidden p-0">
        {/* The Card clips, so a 4-column table lost columns outright on a
            phone. Scroll the wrapper rather than the page — same treatment as
            components/admin/DataTable.tsx. */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] table-auto border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--pm-line-2)] bg-[var(--pm-paper-2)]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--pm-muted)]">
                Event
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--pm-muted)]">
                Points
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--pm-muted)]">
                Cap
              </th>
            </tr>
          </thead>
          <tbody>
            {WEIGHT_ROWS.map(({ event, label, cap }) => (
              <tr key={event} className="border-b border-[var(--pm-line)] last:border-0">
                <td className="px-4 py-3 text-[var(--pm-ink-2)]">{label}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--pm-green)]">
                  +{POINT_WEIGHTS[event]}
                </td>
                <td className="px-4 py-3 text-[var(--pm-muted)]">{cap}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      {/* Level ladder — thresholds from OPERATOR_LEVELS. */}
      <div className="mb-10 flex flex-wrap gap-2">
        {OPERATOR_LEVELS.map(({ level, name, minScore }) => (
          <span
            key={level}
            className="rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 py-1 text-xs font-medium text-[var(--pm-ink-2)]"
          >
            Lv {level} {name} · {minScore.toLocaleString()}+ pts
          </span>
        ))}
      </div>

      <AwardPointsForm />

      {/* Recent awards info */}
      <Card className="mt-6 p-6">
        <h2 className="mb-2 text-lg font-medium">Recent manual awards</h2>
        <p className="text-sm text-[var(--pm-muted)]">
          View recent point awards in the audit log or check the user&apos;s profile for a full
          transaction history.
        </p>
      </Card>
    </div>
  );
}
