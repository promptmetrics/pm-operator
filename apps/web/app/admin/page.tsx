'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  Flag,
  UserPlus,
  Circle,
  FileText,
  MessageSquare,
  CalendarDays,
  Award,
  Terminal,
  Shield,
  Eye,
} from 'lucide-react';
import KpiCard from '@/components/admin/KpiCard';
import SparklineChart from '@/components/admin/SparklineChart';
import LoadingState from '@/components/admin/LoadingState';
import ErrorState from '@/components/admin/ErrorState';

interface OverviewData {
  totalMembers: number;
  activeMembers7d: number;
  pendingFlags: number;
  newMembers30d: number;
  totalCircles: number;
  totalPosts: number;
  totalComments: number;
}

interface GrowthPoint {
  date: string;
  count: number;
}

interface DashboardResponse {
  data: {
    overview: OverviewData;
    memberGrowth: GrowthPoint[];
    postGrowth: GrowthPoint[];
  };
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

export default function AdminDashboardPage() {
  const [data, setData] = React.useState<DashboardResponse['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/analytics?section=overview&period=30d');
      if (!res.ok) {
        throw new Error(`Failed to fetch dashboard data: ${res.status}`);
      }
      const json: DashboardResponse = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load dashboard');
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
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  if (!data) return null;

  const { overview, memberGrowth, postGrowth } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Admin dashboard</h1>

      {/* KPI Row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="Total members" value={overview.totalMembers} icon={Users} />
        <KpiCard title="Active (7d)" value={overview.activeMembers7d} icon={UserCheck} />
        <KpiCard title="Pending flags" value={overview.pendingFlags} icon={Flag} />
        <KpiCard title="New (30d)" value={overview.newMembers30d} icon={UserPlus} />
        <KpiCard title="Total circles" value={overview.totalCircles} icon={Circle} />
      </div>

      {/* Activity Sparkline */}
      <div className="mb-8 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">
          Activity (last 30 days)
        </h3>
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <span className="text-xs text-[var(--pm-muted)]">New members</span>
            <SparklineChart
              data={memberGrowth.map((p) => p.count)}
              color="var(--pm-coral)"
              height={60}
              width={200}
            />
          </div>
          <div className="text-center">
            <span className="text-xs text-[var(--pm-muted)]">New posts</span>
            <SparklineChart
              data={postGrowth.map((p) => p.count)}
              color="var(--pm-coral)"
              height={60}
              width={200}
            />
          </div>
        </div>
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
