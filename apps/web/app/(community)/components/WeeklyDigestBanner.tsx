'use client';

// Dismissible weekly-digest banner shown at the top of the /feed main column
// (T8.3). Pure client component — the server-side feed page computes the digest
// and passes it in, so the banner itself issues no DB queries (pool rule).
// A quiet week (no posts and no solutions) renders nothing. Dismissal persists
// for the ISO week via localStorage; the next week's digest re-shows the banner.

import * as React from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import type { WeeklyDigestData } from '@/lib/email';

function isoWeekKey(d: Date): string {
  // ISO week: Thursday in the week determines the year, per ISO-8601.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function WeeklyDigestBanner({ digest }: { digest: WeeklyDigestData }) {
  const { posts, solutionsAccepted, hotTopicName, hotTopicUrl } = digest;
  const quiet = posts === 0 && solutionsAccepted === 0 && !hotTopicName;

  const storageKey = React.useMemo(
    () => `weekly-digest-dismissed-${isoWeekKey(new Date())}`,
    [],
  );
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (quiet || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, '1');
  };

  return (
    <div className="relative mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-4 py-3 shadow-[var(--pm-shadow)]">
      <Sparkles
        className="h-4 w-4 shrink-0 text-[var(--pm-coral)]"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 basis-56 text-sm text-[var(--pm-ink-2)]">
        <span className="font-medium text-[var(--pm-ink)]">This week:</span>{' '}
        {posts} {posts === 1 ? 'post' : 'posts'} · {solutionsAccepted}{' '}
        {solutionsAccepted === 1 ? 'solution' : 'solutions'} accepted
        {hotTopicName ? (
          <>
            {' · hot topic: '}
            <Link
              href={hotTopicUrl}
              className="font-medium text-[var(--pm-coral)] hover:underline"
            >
              {hotTopicName}
            </Link>
          </>
        ) : null}
      </p>
      {/* At 375px the CTA wraps to its own full-width row instead of cramping
          the summary text into a narrow column. */}
      <Link
        href="/digest"
        className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-[var(--pm-ink)] hover:bg-[var(--pm-paper-2)] max-sm:w-full max-sm:text-center"
      >
        View weekly digest →
      </Link>
      {/* Hit area from the control token (44px on coarse pointers); the 16px
          icon stays and the padding is transparent, so desktop density is
          unchanged. Audit item 12's one missed target. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss weekly digest banner"
        className="flex min-h-[var(--pm-control-h)] min-w-[var(--pm-control-h)] shrink-0 items-center justify-center rounded-lg text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)] max-sm:absolute max-sm:right-1.5 max-sm:top-1.5"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}