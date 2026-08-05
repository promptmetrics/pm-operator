'use client';

import * as React from 'react';
import Link from 'next/link';
import { Users, UserCheck, UserPlus, FileText, MessageSquare, Flag, BarChart3 } from 'lucide-react';
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

interface AnalyticsResponse {
  data: {
    overview: OverviewData;
    memberGrowth: GrowthPoint[];
    postGrowth: GrowthPoint[];
  };
}

export default function AnalyticsOverviewPage() {
  const [period, setPeriod] = React.useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = React.useState<AnalyticsResponse['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/analytics?section=overview&period=${period}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch analytics: ${res.status}`);
      }
      const json: AnalyticsResponse = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Analytics</h1>
        <LoadingState type="card" rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Analytics</h1>
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  if (!data) return null;

  const { overview, memberGrowth, postGrowth } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>

        <div className="flex gap-1 rounded-lg border border-[var(--pm-line)] p-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)]'
                  : 'text-[var(--pm-muted)] hover:text-[var(--pm-ink)]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total members"
          value={overview.totalMembers}
          icon={Users}
        />
        <KpiCard
          title="Active (7d)"
          value={overview.activeMembers7d}
          icon={UserCheck}
        />
        <KpiCard
          title="New (30d)"
          value={overview.newMembers30d}
          icon={UserPlus}
        />
        <KpiCard
          title="Total posts"
          value={overview.totalPosts}
          icon={FileText}
        />
        <KpiCard
          title="Total comments"
          value={overview.totalComments}
          icon={MessageSquare}
        />
        <KpiCard
          title="Flags resolved"
          value={overview.pendingFlags}
          icon={Flag}
        />
      </div>

      {/* Sub-navigation */}
      <div className="mb-6 flex gap-2">
        <Link
          href="/admin/analytics/members"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--pm-line)] px-3 py-2 text-sm font-medium text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
        >
          <Users className="h-4 w-4" />
          Members
        </Link>
        <Link
          href="/admin/analytics/engagement"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--pm-line)] px-3 py-2 text-sm font-medium text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
        >
          <BarChart3 className="h-4 w-4" />
          Engagement
        </Link>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">
            Members over time
          </h3>
          <div className="flex items-end justify-center">
            <SparklineChart
              data={memberGrowth.map((p) => p.count)}
              color="var(--pm-coral)"
              height={80}
              width={300}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--pm-muted)]">
            <span>{memberGrowth[0]?.date ?? ''}</span>
            <span>{memberGrowth[memberGrowth.length - 1]?.date ?? ''}</span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">
            Posts over time
          </h3>
          <div className="flex items-end justify-center">
            <SparklineChart
              data={postGrowth.map((p) => p.count)}
              color="var(--pm-coral)"
              height={80}
              width={300}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--pm-muted)]">
            <span>{postGrowth[0]?.date ?? ''}</span>
            <span>{postGrowth[postGrowth.length - 1]?.date ?? ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
