'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Card, CardContent, CardTitle } from '@pm-operator/ui/components/Card';
import { useToast } from '@pm-operator/ui/components/Toast';

export interface OnboardingChecklistProps {
  circleCount: number;
  hasPost: boolean;
  hasComment: boolean;
  /** Target circles for step 1 (server constant CHECKLIST_CIRCLE_TARGET). */
  circleTarget: number;
}

interface Step {
  key: string;
  label: string;
  href: string;
  cta: string;
  done: boolean;
}

/**
 * Feed onboarding checklist (plan §4.7). Three steps, n/3 progress, each
 * incomplete step deep-links to where it gets done. Dismissing PATCHes
 * `preferences.checklistDismissed` through the same /api/v1/me route Settings
 * uses, so the feed page skips the checklist query on every later request.
 */
export function OnboardingChecklist({
  circleCount,
  hasPost,
  hasComment,
  circleTarget,
}: OnboardingChecklistProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [dismissing, setDismissing] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  const steps: Step[] = [
    {
      key: 'circles',
      label:
        circleCount > 0 && circleCount < circleTarget
          ? `Join ${circleTarget} circles (${circleCount}/${circleTarget})`
          : `Join ${circleTarget} circles`,
      href: '/g',
      cta: 'Browse circles',
      done: circleCount >= circleTarget,
    },
    {
      key: 'post',
      label: 'Write your first post',
      href: '/post/new',
      cta: 'Start a post',
      done: hasPost,
    },
    {
      key: 'comment',
      label: 'Leave your first comment',
      href: '/feed',
      cta: 'Find a discussion',
      done: hasComment,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  const dismiss = async () => {
    setDismissing(true);
    try {
      const res = await fetch('/api/v1/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences: { checklistDismissed: true } }),
      });
      if (!res.ok) throw new Error('Failed to dismiss');
      setHidden(true);
      router.refresh();
    } catch {
      setDismissing(false);
      toast({ title: 'Could not dismiss the checklist', variant: 'error' });
    }
  };

  if (hidden) return null;

  return (
    <Card className="mb-4" data-testid="onboarding-checklist">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Get started</CardTitle>
            <p className="text-sm text-[var(--pm-muted)]">
              Three steps to get the most out of the community.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium text-[var(--pm-muted)]"
              data-testid="onboarding-progress"
            >
              {completed}/3
            </span>
            <button
              type="button"
              onClick={dismiss}
              disabled={dismissing}
              aria-label="Dismiss checklist"
              className="rounded-md p-1 text-[var(--pm-muted)] hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)] disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className="h-1.5 overflow-hidden rounded-[var(--pm-radius-pill)] bg-[var(--pm-paper-2)]"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={3}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full bg-[var(--pm-green)] transition-[width]"
            style={{ width: `${(completed / 3) * 100}%` }}
          />
        </div>

        <ul className="space-y-2">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={
                    step.done
                      ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--pm-green)] text-[var(--pm-on-ink)]'
                      : 'h-5 w-5 shrink-0 rounded-full border border-[var(--pm-line)]'
                  }
                >
                  {step.done ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={
                    step.done
                      ? 'truncate text-[var(--pm-muted)] line-through'
                      : 'truncate text-[var(--pm-ink)]'
                  }
                >
                  {step.label}
                </span>
              </span>
              {step.done ? (
                <span className="sr-only">Completed</span>
              ) : (
                <Link
                  href={step.href}
                  className="shrink-0 text-sm font-medium text-[var(--pm-coral)] hover:underline"
                >
                  {step.cta}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
