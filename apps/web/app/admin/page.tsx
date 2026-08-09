'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  Flag,
  Shield,
  Terminal,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import type { AdminDashboard } from '@pm-operator/api';
import KpiCard from '@/components/admin/KpiCard';
import LoadingState from '@/components/admin/LoadingState';
import ErrorState, { type ErrorStateProps } from '@/components/admin/ErrorState';
import NeedsAttention from '@/components/admin/NeedsAttention';
import NewestMembers from '@/components/admin/NewestMembers';
import PostsPerDayChart from '@/components/admin/PostsPerDayChart';
import {
  countDelta,
  durationDelta,
  formatDuration,
  formatRate,
  nullableValue,
  rateDelta,
} from '@/components/admin/dashboard-metrics';

interface DashboardResponse {
  data: {
    dashboard: AdminDashboard;
    posthog: unknown;
  };
}

interface LoadError {
  message: string;
  variant: ErrorStateProps['variant'];
}

const QUICK_ACTIONS = [
  {
    href: '/admin/moderation',
    label: 'Review moderation queue',
    icon: Shield,
  },
  {
    href: '/admin/groups',
    label: 'Create circle',
    icon: Circle,
  },
  {
    href: '/admin/events',
    label: 'Create event',
    icon: CalendarDays,
  },
  {
    href: '/admin/badges',
    label: 'Award badge',
    icon: Award,
  },
];

const NAV_CARDS = [
  {
    href: '/admin/moderation',
    title: 'Moderation',
    description: 'Review flagged posts and comments.',
    icon: Flag,
  },
  {
    href: '/admin/groups',
    title: 'Circles',
    description: 'Create and manage community circles.',
    icon: Circle,
  },
  {
    href: '/admin/events',
    title: 'Events',
    description: 'Manage community events.',
    icon: CalendarDays,
  },
  {
    href: '/admin/watched-phrases',
    title: 'Watched phrases',
    description: 'Manage auto-flag patterns.',
    icon: Eye,
  },
  {
    href: '/admin/badges',
    title: 'Badges',
    description: 'Create badges and award them manually.',
    icon: Award,
  },
  {
    href: '/admin/users',
    title: 'Users',
    description: 'Search users and manage roles.',
    icon: Users,
  },
  {
    href: '/admin/agent-actions',
    title: 'Agent actions',
    description: 'View MCP agent action audit log.',
    icon: Terminal,
  },
];

/**
 * Every message handed to ErrorState is authored here. ErrorState prints what
 * it is given straight to the page, so a caught exception's own text must never
 * reach it.
 */
const NETWORK_ERROR: LoadError = {
  message:
    'Could not reach the analytics service. Check your connection and try again.',
  variant: 'network',
};

const PERMISSION_ERROR: LoadError = {
  message: 'Viewing these metrics requires global admin access.',
  variant: 'permission',
};

const SERVICE_ERROR: LoadError = {
  message:
    'The analytics service could not build the dashboard. Try again in a moment.',
  variant: 'error',
};

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = React.useState<AdminDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<LoadError | null>(null);

  // One request for the whole page. The endpoint fans out to two sequential
  // waves of three queries internally, so the pool of 3 is already fully
  // committed — nothing else may be fetched alongside it.
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch('/api/v1/admin/analytics?section=dashboard');
    } catch {
      setError(NETWORK_ERROR);
      setLoading(false);
      return;
    }

    if (!res.ok) {
      setError(res.status === 403 ? PERMISSION_ERROR : SERVICE_ERROR);
      setLoading(false);
      return;
    }

    try {
      const json: DashboardResponse = await res.json();
      setDashboard(json.data.dashboard);
    } catch {
      setError(SERVICE_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Admin dashboard</h1>
        <LoadingState type="card" rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Admin dashboard</h1>
        <ErrorState
          message={error.message}
          variant={error.variant}
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!dashboard) return null;

  const { weekly, postsPerDay, newestMembers, needsAttention } = dashboard;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-semibold">Admin dashboard</h1>
      <p className="mb-6 text-sm text-[var(--pm-muted)]">
        The last seven days, measured against the seven before them.
      </p>

      {/* Week-over-week KPI tiles */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Posts created"
          value={weekly.postsCreated.current}
          delta={countDelta(weekly.postsCreated)}
          icon={FileText}
        />
        <KpiCard
          title="Solved rate"
          value={nullableValue(weekly.solvedRate.current, formatRate)}
          delta={rateDelta(weekly.solvedRate)}
          icon={CheckCircle2}
        />
        <KpiCard
          title="Active members"
          value={weekly.activeMembers.current}
          delta={countDelta(weekly.activeMembers)}
          icon={UserCheck}
        />
        <KpiCard
          title="Median first answer"
          value={nullableValue(
            weekly.medianTimeToFirstAnswerSeconds.current,
            formatDuration,
          )}
          delta={durationDelta(weekly.medianTimeToFirstAnswerSeconds)}
          icon={Timer}
        />
      </div>

      <div className="mb-8">
        <SectionCard title="Posts per day">
          <PostsPerDayChart points={postsPerDay} />
        </SectionCard>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Newest members">
          <NewestMembers members={newestMembers} />
        </SectionCard>

        <SectionCard title="Needs attention">
          <NeedsAttention items={needsAttention} />
        </SectionCard>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--pm-line)] px-3 py-2 text-sm font-medium text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_CARDS.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-3 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 transition-colors hover:bg-[var(--pm-paper-2)]"
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pm-coral)]" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--pm-ink)]">{title}</h3>
              <p className="mt-0.5 text-xs text-[var(--pm-muted)]">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
