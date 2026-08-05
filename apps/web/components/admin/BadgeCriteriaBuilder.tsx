'use client';

import * as React from 'react';
import { Input } from '@pm-operator/ui/components/Input';
import type { PointEventType, BadgeCriteria } from '@pm-operator/api';

const EVENT_TYPES: PointEventType[] = [
  'topic_created',
  'comment_created',
  'solution_accepted',
  'like_received',
  'like_given',
  'invite_accepted',
  'daily_visit',
  'posts_read',
  'manual_award',
];

const POST_TYPES = ['discussion', 'question', 'build', 'lesson'] as const;

export interface BadgeCriteriaBuilderProps {
  value: BadgeCriteria;
  onChange: (criteria: BadgeCriteria) => void;
}

export default function BadgeCriteriaBuilder({ value, onChange }: BadgeCriteriaBuilderProps) {
  const [preview, setPreview] = React.useState<{ count: number; label: string } | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const isStreak = 'type' in value && value.type === 'streak';

  React.useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);

    const params = new URLSearchParams();
    if (!isStreak && 'eventType' in value) {
      params.set('eventType', value.eventType);
      params.set('threshold', String(value.threshold));
      if ('postType' in value && value.postType) params.set('postType', value.postType);
      if ('groupSlug' in value && value.groupSlug) params.set('groupSlug', value.groupSlug);
    }
    if (isStreak) {
      params.set('streakDays', String(value.days));
    }

    fetch(`/api/v1/admin/badges/preview?${params.toString()}`)
      .then((r) => r.json())
      .then((json: { data?: { count: number; label: string } }) => {
        if (!cancelled) {
          setPreview(json.data ?? null);
          setPreviewLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null);
          setPreviewLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [value, isStreak]);

  const update = (patch: Partial<BadgeCriteria>) => {
    onChange({ ...value, ...patch } as BadgeCriteria);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Criteria type</label>
        <select
          value={isStreak ? 'streak' : 'count'}
          onChange={(e) => {
            if (e.target.value === 'streak') {
              onChange({ type: 'streak', days: 7 } as BadgeCriteria);
            } else {
              onChange({ eventType: 'topic_created', threshold: 1 } as BadgeCriteria);
            }
          }}
          className="h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
        >
          <option value="count">Event count</option>
          <option value="streak">Streak</option>
        </select>
      </div>

      {isStreak ? (
        <Input
          label="Streak days"
          type="number"
          min={1}
          value={value.days}
          onChange={(e) => update({ days: Number(e.target.value) } as Partial<BadgeCriteria>)}
        />
      ) : (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">Event type</label>
            <select
              value={'eventType' in value ? value.eventType : 'topic_created'}
              onChange={(e) => update({ eventType: e.target.value as PointEventType })}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <Input
            label="Threshold"
            type="number"
            min={1}
            value={'threshold' in value ? value.threshold : 1}
            onChange={(e) => update({ threshold: Number(e.target.value) })}
          />

          <div>
            <label className="mb-1 block text-sm font-medium">Post type (optional)</label>
            <select
              value={'postType' in value ? (value.postType ?? '') : ''}
              onChange={(e) => update({ postType: e.target.value || undefined } as Partial<BadgeCriteria>)}
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
            >
              <option value="">Any</option>
              {POST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <Input
            label="Circle slug (optional)"
            value={'groupSlug' in value ? (value.groupSlug ?? '') : ''}
            onChange={(e) => update({ groupSlug: e.target.value || undefined } as Partial<BadgeCriteria>)}
          />
        </>
      )}

      {/* Preview */}
      <div className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3">
        <p className="mb-1 text-xs font-medium text-[var(--pm-muted)]">Preview</p>
        {previewLoading ? (
          <p className="text-sm text-[var(--pm-muted)]">Calculating...</p>
        ) : preview ? (
          <p className="text-sm text-[var(--pm-ink)]">
            {preview.count} user{preview.count !== 1 ? 's' : ''} would qualify &mdash; {preview.label}
          </p>
        ) : (
          <p className="text-sm text-[var(--pm-muted)]">Unable to calculate preview</p>
        )}
      </div>
    </div>
  );
}
