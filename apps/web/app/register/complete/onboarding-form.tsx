'use client';

import * as React from 'react';
import clsx from 'clsx';
import { BadgeCheck, Check, Heart, MessageSquare, PenLine } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { POINT_WEIGHTS, PointEventType, OPERATOR_LEVELS, levelForScore } from '@pm-operator/api';
import { Checkbox } from '@/components/ui/checkbox';
import { BioLengthMeter } from '@/components/BioLengthMeter';
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
          <ol className="flex items-center justify-center gap-1" aria-label="Onboarding progress">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <React.Fragment key={label}>
                  <li className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                        active &&
                          'bg-[var(--pm-coral)] text-[var(--pm-on-ink)] shadow-[var(--pm-shadow)]',
                        done && 'bg-[var(--pm-green)] text-[var(--pm-on-ink)]',
                        !active && !done && 'border border-[var(--pm-line)] text-[var(--pm-muted)]'
                      )}
                      aria-current={active ? 'step' : undefined}
                      aria-label={
                        done
                          ? `Step ${n} complete`
                          : active
                            ? `Step ${n}, current`
                            : `Step ${n}, not started`
                      }
                    >
                      {done ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
                    </span>
                    <span
                      className={clsx(
                        'text-xs',
                        active
                          ? 'font-semibold text-[var(--pm-ink)]'
                          : 'text-[var(--pm-ink-2)]'
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
          {step > 1 ? (
            <p className="mt-3 text-center text-xs text-[var(--pm-muted-soft)]">
              Your progress is saved — close this and come back any time.
            </p>
          ) : null}
          <div className="mt-8">{children}</div>
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
  initialBio,
}: {
  userId: string;
  fullName: string;
  initialTask: string;
  initialStackTags: string[];
  initialBio: string;
}) {
  const [task, setTask] = React.useState(initialTask);
  const [selectedTags, setSelectedTags] = React.useState<string[]>(initialStackTags);
  const [customTag, setCustomTag] = React.useState('');
  const [bio, setBio] = React.useState(initialBio);
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
      aboutMe: bio.trim(),
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
        description="One sentence is enough. It ranks the circles we suggest next."
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="I can't get MCP servers to authenticate consistently in our Next.js app."
        disabled={isLoading}
        autoFocus
        error={error && !task.trim() ? error : undefined}
      />

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-[var(--pm-ink)]">Stack tags</p>
          <p className="text-xs text-[var(--pm-muted)]">Optional — pick any that apply.</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
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

      {/* Bio card (SEO plan Phase 3e, per Onboarding.dc.html): optional, earns
          the one-time +5 profile_bio bonus at ≥50 trimmed chars. */}
      <section
        aria-labelledby="onboarding-bio-heading"
        className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-5 shadow-[var(--pm-shadow)]"
      >
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2
            id="onboarding-bio-heading"
            className="font-serif text-base font-semibold text-[var(--pm-ink)]"
          >
            Tell the community who you are
          </h2>
          <span className="rounded-[var(--pm-radius-pill)] bg-[var(--pm-coral-tint)] px-2.5 py-1 text-xs font-bold text-[var(--pm-coral-dark)]">
            +5 pts
          </span>
        </div>
        <p className="mb-3.5 text-[13px] leading-[1.6] text-[var(--pm-ink-2)]">
          Two sentences is plenty: role, company size, what you operate. People reply to names
          they can place. It&apos;s the single biggest thing you can do to get answers in your
          first week.
        </p>
        <textarea
          id="onboarding-bio"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="RevOps lead at a 40-person B2B SaaS. I run HubSpot and Outreach, and I'm trying to stop hand-merging duplicate contacts every Friday."
          disabled={isLoading}
          className="box-border w-full resize-y rounded-[var(--pm-radius-sm)] border border-[var(--pm-line-2)] bg-[var(--pm-paper)] px-3.5 py-3 text-[15px] leading-[1.6] text-[var(--pm-ink)] focus:border-[var(--pm-coral)] focus:outline-none"
        />
        <BioLengthMeter value={bio} variant="onboarding" />
      </section>

      <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
        Continue
      </Button>

      <p className="text-center">
        <a
          href="/guidelines"
          className="text-[13px] font-medium text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
        >
          Posting guidelines
        </a>
      </p>
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
        <div className="space-y-3 py-4 text-center">
          <p className="font-serif text-base font-semibold text-[var(--pm-ink)]">
            No circles matched your stack yet
          </p>
          <p className="text-sm text-[var(--pm-muted)]">
            No circles are available to join right now. You can explore and join circles from the
            feed later.
          </p>
        </div>
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
                    ? 'border-[var(--pm-coral)] bg-[var(--pm-coral-tint-10)] shadow-[var(--pm-shadow)]'
                    : 'border-[var(--pm-line)] bg-[var(--pm-paper)] hover:border-[var(--pm-line-2)] hover:bg-[var(--pm-paper-inset)]'
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--pm-line)] font-serif text-base font-semibold text-[var(--pm-on-ink)]"
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
                  <span className="text-xs text-[var(--pm-muted-soft)]">
                    {c.memberCount.toLocaleString()} members
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--pm-coral)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]"
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
      <p className="text-center text-xs text-[var(--pm-muted-soft)]">
        Pick at least two — you can leave or join more at any time.
      </p>
    </form>
  );
}

// Point values and the level ladder are read straight from the API contracts
// (packages/api/src/contracts/points.ts and .../users.ts), never retyped here.
// invite_accepted moved 5 → 15 on 2026-08-08; a primer with the numbers baked in
// would still be quoting the old value to every new member.
const EARN_ROWS = [
  {
    Icon: PenLine,
    label: 'Publish a post',
    points: POINT_WEIGHTS[PointEventType.TOPIC_CREATED],
  },
  {
    Icon: MessageSquare,
    label: 'Leave a comment',
    points: POINT_WEIGHTS[PointEventType.COMMENT_CREATED],
  },
  {
    Icon: BadgeCheck,
    label: 'Your reply is accepted as the solution',
    points: POINT_WEIGHTS[PointEventType.SOLUTION_ACCEPTED],
  },
  {
    Icon: Heart,
    label: 'Someone likes your post or comment',
    points: POINT_WEIGHTS[PointEventType.LIKE_RECEIVED],
  },
] as const;

// A brand-new account has no score, so ask levelForScore where zero lands
// rather than assuming the ladder starts at 1.
const STARTING_LEVEL = levelForScore(0).level;

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
            You're now following{' '}
            <span className="font-medium text-[var(--pm-ink)]">{joinedSummary}</span>.
          </p>
        ) : null}
      </div>

      <section
        aria-labelledby="points-heading"
        className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-4"
      >
        <h2
          id="points-heading"
          className="font-serif text-sm font-semibold text-[var(--pm-ink)]"
        >
          How you earn points
        </h2>
        <ul className="mt-3 space-y-2">
          {EARN_ROWS.map(({ Icon, label, points }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-lg bg-[var(--pm-paper-inset)] px-3 py-2"
            >
              <Icon
                className="h-4 w-4 shrink-0 text-[var(--pm-muted-soft)]"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 text-sm text-[var(--pm-ink-2)]">{label}</span>
              <span className="shrink-0 font-mono text-sm font-semibold text-[var(--pm-coral-dark)]">
                +{points} pts
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--pm-muted-soft)]">
          Giving likes and showing up daily earn a little too, with daily caps so volume never beats
          usefulness.
        </p>
      </section>

      <section aria-labelledby="ladder-heading">
        <h2
          id="ladder-heading"
          className="font-serif text-sm font-semibold text-[var(--pm-ink)]"
        >
          The operator ladder
        </h2>
        <p className="mt-1 text-xs text-[var(--pm-muted)]">
          Your level is derived from your score — nothing to claim or apply for.
        </p>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OPERATOR_LEVELS.map((tier) => {
            const isStart = tier.level === STARTING_LEVEL;
            return (
              <li
                key={tier.level}
                className={clsx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2',
                  isStart
                    ? 'border-[var(--pm-coral)] bg-[var(--pm-coral-tint-10)]'
                    : 'border-[var(--pm-line)] bg-[var(--pm-paper-inset)]'
                )}
              >
                <LevelBadge level={tier.level} size="md" className="border-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--pm-ink)]">
                    {tier.name}
                  </span>
                  <span className="block text-xs text-[var(--pm-muted)]">
                    {isStart ? 'You start here' : `${tier.minScore.toLocaleString()} pts`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

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

      <p className="text-center">
        <a
          href="/guidelines"
          className="text-[13px] font-medium text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
        >
          Posting guidelines
        </a>
      </p>

      {error ? (
        <p className="text-sm text-[var(--pm-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}