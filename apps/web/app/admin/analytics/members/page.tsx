'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, UserPlus, Activity } from 'lucide-react';
import KpiCard from '@/components/admin/KpiCard';
import SparklineChart from '@/components/admin/SparklineChart';
import LoadingState from '@/components/admin/LoadingState';
import ErrorState from '@/components/admin/ErrorState';

interface OverviewData {
  totalMembers: number;
  activeMembers7d: number;
  newMembers30d: number;
}

interface GrowthPoint {
  date: string;
  count: number;
}

interface MembersResponse {
  data: {
    overview: OverviewData;
    memberGrowth: GrowthPoint[];
  };
}

const ACTIVITY_LEVELS = [
  { label: 'High', min: 20, color: 'bg-green-500' },
  { label: 'Medium', min: 10, color: 'bg-yellow-500' },
  { label: 'Low', min: 1, color: 'bg-orange-500' },
  { label: 'Inactive', min: 0, color: 'bg-gray-300' },
] as const;

export default function AnalyticsMembersPage() {
  const [data, setData] = React.useState<MembersResponse['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/analytics?section=members&period=30d');
      if (!res.ok) {
        throw new Error(`Failed to fetch member analytics: ${res.status}`);
      }
      const json: MembersResponse = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load member analytics');
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
        <h1 className="mb-6 text-2xl font-semibold">Member Analytics</h1>
        <LoadingState type="card" rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Member Analytics</h1>
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  if (!data) return null;

  const { overview, memberGrowth } = data;

  // Compute activity distribution based on memberGrowth data
  const totalGrowth = memberGrowth.reduce((sum, p) => sum + p.count, 0);
  const activeDays = memberGrowth.filter((p) => p.count > 0).length;
  const avgDaily = activeDays > 0 ? Math.round(totalGrowth / activeDays) : 0;

  const activityDistribution = ACTIVITY_LEVELS.map((level) => {
    const count = memberGrowth.filter((p) => p.count >= level.min).length;
    const pct = memberGrowth.length > 0 ? Math.round((count / memberGrowth.length) * 100) : 0;
    return { ...level, count, pct };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/analytics"
          className="flex items-center gap-1 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Analytics
        </Link>
        <h1 className="text-2xl font-semibold">Member Analytics</h1>
      </div>

      {/* KPI Row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <KpiCard title="Total members" value={overview.totalMembers} icon={Users} />
        <KpiCard title="Active (7d)" value={overview.activeMembers7d} icon={Activity} />
        <KpiCard title="New (30d)" value={overview.newMembers30d} icon={UserPlus} />
      </div>

      {/* Growth Chart */}
      <div className="mb-8 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">
          New members per day (30 days)
        </h3>
        <div className="flex items-end justify-center py-4">
          <SparklineChart
            data={memberGrowth.map((p) => p.count)}
            color="var(--pm-coral)"
            height={100}
            width={500}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-[var(--pm-muted)]">
          <span>{memberGrowth[0]?.date ?? ''}</span>
          <span>{memberGrowth[memberGrowth.length - 1]?.date ?? ''}</span>
        </div>
      </div>

      {/* Activity Distribution */}
      <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
        <h3 className="mb-4 text-sm font-semibold text-[var(--pm-ink)]">
          Activity distribution
        </h3>
        <div className="space-y-3">
          {activityDistribution.map((level) => (
            <div key={level.label} className="flex items-center gap-3">
              <div className="flex w-20 items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${level.color}`} />
                <span className="text-sm text-[var(--pm-ink)]">{level.label}</span>
              </div>
              <div className="flex-1">
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--pm-line)]">
                  <div
                    className={`h-full rounded-full ${level.color}`}
                    style={{ width: `${level.pct}%` }}
                  />
                </div>
              </div>
              <span className="w-16 text-right text-xs text-[var(--pm-muted)]">
                {level.count} days ({level.pct}%)
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-[var(--pm-muted)]">
          Based on daily new member activity over the last 30 days. Average: {avgDaily} new members/day on active days.
        </p>
      </div>
    </div>
  );
}
