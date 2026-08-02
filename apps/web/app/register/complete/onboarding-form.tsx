'use client';

import * as React from 'react';
import clsx from 'clsx';
import { Button } from '@pm-operator/ui/components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { Checkbox } from '@/components/ui/checkbox';
import { trackEvent, identifyAnalytics } from '@/lib/analytics';
import { saveOnboardingStep1, joinOnboardingCircles, finishOnboarding } from './actions';
import type { RecommendedCircle } from '@/lib/services/groups';

const STACK_OPTIONS = [
  'MCP',
  'Next.js',
  'Vercel',
  'LangChain',
  'OpenAI',
  'Authentication',
  'Evals',
  'Multi-agent orchestration',
  'Governance',
  'Storage',
  'Supabase',
  'Postgres',
  'Redis',
  'Observability',
  'Testing',
];

const STEP_LABELS = ['Your focus', 'Your circles', 'Get started'];

// Shared shell: centered Card with the 3-step progress indicator above the
// step-specific content. The server page owns `step`, so the indicator reflects
// persisted progress and survives reloads.
export function OnboardingShell({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Welcome to PromptMetrics</CardTitle>
          <CardDescription>Three quick steps to get you into the right circles.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="mb-8 flex items-center justify-center gap-1" aria-label="Onboarding progress">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <React.Fragment key={label}>
                  <li className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                        active && 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]',
                        done && 'bg-[var(--pm-green)] text-[var(--pm-on-ink)]',
                        !active && !done && 'border border-[var(--pm-line)] text-[var(--pm-muted)]'
                      )}
                      aria-current={active ? 'step' : undefined}
                    >
                      {n}
                    </span>
                    <span
                      className={clsx(
                        'text-xs',
                        active ? 'font-semibold text-[var(--pm-ink)]' : 'text-[var(--pm-muted)]'
                      )}
                    >
                      {label}
                    </span>
                  </li>
                  {i < STEP_LABELS.length - 1 ? (
                    <span className="mx-1 h-px w-5 bg-[var(--pm-line)] sm:w-8" aria-hidden="true" />
                  ) : null}
                </React.Fragment>
              );
            })}
          </ol>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}

// Step 1: the painful-tool-stack task + stack tags. This form only renders for
// users who haven't started onboarding, so mounting here is a clean "fresh
// signup" signal for activation analytics (T8.2). On submit the action advances
// to step 2 and redirects back here, which re-renders at step 2 server-side.
export function Step1Focus({
  userId,
  fullName,
  initialTask,
  initialStackTags,
}: {
  userId: string;
  fullName: string;
  initialTask: string;
  initialStackTags: string[];
}) {
  const [task, setTask] = React.useState(initialTask);
  const [selectedTags, setSelectedTags] = React.useState<string[]>(initialStackTags);
  const [customTag, setCustomTag] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    identifyAnalytics(userId);
    trackEvent('signup');
  }, [userId]);

  const displayName = fullName || 'there';

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function addCustomTag() {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    if (!selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setCustomTag('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!task.trim()) {
      setError('Describe the problem you are working on.');
      return;
    }
    setIsLoading(true);
    setError(undefined);
    const result = await saveOnboardingStep1({
      userId,
      painfulToolStackTask: task.trim(),
      stackTags: selectedTags,
    });
    setIsLoading(false);
    if (result?.error) setError(result.error);
    // success → the action redirects to /register/complete (re-renders at step 2)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="onboarding-form">
      <Input
        id="painful-tool-stack-task"
        label="What is the most painful tool-stack or agent problem you are working on right now?"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="I can't get MCP servers to authenticate consistently in our Next.js app."
        disabled={isLoading}
        error={error && !task.trim() ? error : undefined}
      />

      <div className="space-y-3">
        <p className="text-sm font-medium text-[var(--pm-ink)]">Stack tags</p>
        <div className="flex flex-wrap gap-3">
          {STACK_OPTIONS.map((tag) => (
            <Checkbox
              key={tag}
              label={tag}
              checked={selectedTags.includes(tag)}
              onChange={() => toggleTag(tag)}
              disabled={isLoading}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="custom-tag"
            placeholder="Add a custom tag"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag();
              }
            }}
            disabled={isLoading}
          />
          <Button type="button" variant="secondary" onClick={addCustomTag} disabled={isLoading}>
            Add
          </Button>
        </div>
        {selectedTags.length > 0 ? (
          <p className="text-sm text-[var(--pm-muted)]">Selected: {selectedTags.join(', ')}</p>
        ) : null}
      </div>

      {error && task.trim() ? (
        <p className="text-sm text-[var(--pm-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
        Continue
      </Button>
    </form>
  );
}

// Step 2: pick ≥2 circles. The list is pre-ranked by the server (keyword match
// then popularity); the top two are pre-selected so a user can continue in one
// click, but they can change the selection freely.
export function Step2Circles({
  userId,
  circles,
}: {
  userId: string;
  circles: RecommendedCircle[];
}) {
  const [selected, setSelected] = React.useState<string[]>(() =>
    circles.slice(0, 2).map((c) => c.slug)
  );
  const [error, setError] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(false);

  function toggle(slug: string) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (selected.length < 2) {
      setError('Join at least two circles to continue.');
      return;
    }
    setIsLoading(true);
    setError(undefined);
    const result = await joinOnboardingCircles({ userId, slugs: selected });
    setIsLoading(false);
    if (result?.error) setError(result.error);
    // success → the action redirects to /register/complete (re-renders at step 3)
  }

  if (circles.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--pm-muted)]">
          No circles are available to join right now. You can explore and join circles from the feed
          later.
        </p>
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isLoading}
          onClick={async () => {
            setIsLoading(true);
            // Skip straight to step 3 with no joins.
            const result = await finishOnboarding({ userId, mode: 'explore' });
            setIsLoading(false);
            if (result?.error) setError(result.error);
          }}
        >
          Skip and explore
        </Button>
        {error ? (
          <p className="text-sm text-[var(--pm-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="onboarding-circles">
      <p className="text-sm text-[var(--pm-muted)]">
        Based on your focus, here are circles worth joining. Pick at least two.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {circles.map((c) => {
          const checked = selected.includes(c.slug);
          return (
            <li key={c.slug}>
              <label
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
                  checked
                    ? 'border-[var(--pm-coral)] bg-[var(--pm-paper-inset)]'
                    : 'border-[var(--pm-line)] bg-[var(--pm-paper)] hover:bg-[var(--pm-paper-inset)]'
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-serif text-base font-semibold text-[var(--pm-on-ink)]"
                  style={{ backgroundColor: c.color ?? 'var(--pm-coral)' }}
                  aria-hidden="true"
                >
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-sm font-semibold text-[var(--pm-ink)]">
                    {c.name}
                  </span>
                  {c.description ? (
                    <span className="block truncate text-xs text-[var(--pm-muted)]">
                      {c.description}
                    </span>
                  ) : null}
                  <span className="text-xs text-[var(--pm-muted)]">
                    {c.memberCount.toLocaleString()} members
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-[var(--pm-coral)]"
                  checked={checked}
                  onChange={() => toggle(c.slug)}
                  disabled={isLoading}
                  aria-label={`Join ${c.name}`}
                />
              </label>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="text-sm text-[var(--pm-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isLoading || selected.length < 2}
      >
        {isLoading ? 'Joining…' : `Join ${selected.length} circle${selected.length === 1 ? '' : 's'}`}
      </Button>
    </form>
  );
}

// Step 3: reputation primer. Onboarding is effectively complete here, so this
// fires the onboarding_complete analytics event (T8.2). The two CTAs finish
// onboarding and land on the feed — "Write your first post" also opens the
// composer via ?compose=1.
export function Step3Primer({
  userId,
  joinedCircleNames,
}: {
  userId: string;
  joinedCircleNames: string[];
}) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    trackEvent('onboarding_complete', { joinedCircles: joinedCircleNames });
  }, [joinedCircleNames]);

  async function finish(mode: 'explore' | 'post') {
    setIsLoading(true);
    setError(undefined);
    const result = await finishOnboarding({ userId, mode });
    setIsLoading(false);
    if (result?.error) setError(result.error);
    // success → the action redirects to /feed?welcome=1…
  }

  const joinedList = joinedCircleNames.filter(Boolean);
  const joinedSummary =
    joinedList.length === 0
      ? ''
      : joinedList.length === 1
        ? joinedList[0]
        : joinedList.length === 2
          ? `${joinedList[0]} and ${joinedList[1]}`
          : `${joinedList.slice(0, -1).join(', ')}, and ${joinedList[joinedList.length - 1]}`;

  return (
    <div className="space-y-6" data-testid="onboarding-primer">
      <div className="space-y-2">
        <p className="font-serif text-lg font-semibold text-[var(--pm-ink)]">
          Your reputation starts now.
        </p>
        <p className="text-sm text-[var(--pm-muted)]">
          Reputation here is earned by helping — answering questions, sharing builds, and accepting
          solutions. You don't need to be an expert to start; the first useful thing you post is
          worth more than waiting to have it perfect.
        </p>
        {joinedSummary ? (
          <p className="text-sm text-[var(--pm-muted)]">
            You're now following <span className="font-medium text-[var(--pm-ink)]">{joinedSummary}</span>.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" size="lg" disabled={isLoading} onClick={() => finish('explore')}>
          Start exploring
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          disabled={isLoading}
          onClick={() => finish('post')}
        >
          Write your first post
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--pm-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}