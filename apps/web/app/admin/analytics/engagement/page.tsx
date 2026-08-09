'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Circle, FileText, Trophy, TrendingUp } from 'lucide-react';
import LoadingState from '@/components/admin/LoadingState';
import ErrorState from '@/components/admin/ErrorState';

interface TopCircle {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  postCount: number;
  commentCount: number;
  memberCount: number;
  engagementScore: number;
}

interface TopPost {
  id: string;
  title: string;
  groupSlug: string;
  upvotes: number;
  commentCount: number;
  viewCount: number;
}

interface TopMember {
  id: string;
  username: string;
  userslug: string;
  reputationScore: number;
  streakDays: number;
}

interface EngagementData {
  topCircles: TopCircle[];
  topPosts: TopPost[];
  topMembers: TopMember[];
}

interface EngagementResponse {
  data: {
    engagement: EngagementData;
  };
}

export default function AnalyticsEngagementPage() {
  const [data, setData] = React.useState<EngagementResponse['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/analytics?section=engagement');
      if (!res.ok) {
        throw new Error(`Failed to fetch engagement analytics: ${res.status}`);
      }
      const json: EngagementResponse = await res.json();
      setData(json.data);
    } catch (err) {
      console.error('[admin/analytics/engagement] load failed', err);
      setError('Could not load engagement analytics. Try again.');
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
        <h1 className="mb-6 text-2xl font-semibold">Engagement Analytics</h1>
        <LoadingState type="card" rows={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-semibold">Engagement Analytics</h1>
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  if (!data) return null;

  const { engagement } = data;

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
        <h1 className="text-2xl font-semibold">Engagement Analytics</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Circles */}
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Circle className="h-4 w-4 text-[var(--pm-coral)]" />
            <h3 className="text-sm font-semibold text-[var(--pm-ink)]">
              Top circles by engagement
            </h3>
          </div>

          {engagement.topCircles.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--pm-muted)]">
              No circles found.
            </p>
          ) : (
            <div className="space-y-3">
              {engagement.topCircles.map((circle, i) => (
                <div
                  key={circle.id}
                  className="flex items-center justify-between border-b border-[var(--pm-line)] pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs font-bold text-[var(--pm-muted)]">
                      #{i + 1}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-[var(--pm-ink)]">
                        {circle.name}
                      </span>
                      <div className="flex gap-3 text-xs text-[var(--pm-muted)]">
                        <span>{circle.postCount} posts</span>
                        <span>{circle.commentCount} comments</span>
                        <span>{circle.memberCount} members</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-[var(--pm-coral)]">
                      {circle.engagementScore.toLocaleString()}
                    </span>
                    <div className="text-xs text-[var(--pm-muted)]">score</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Posts */}
        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--pm-coral)]" />
            <h3 className="text-sm font-semibold text-[var(--pm-ink)]">
              Top posts by upvotes
            </h3>
          </div>

          {engagement.topPosts.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--pm-muted)]">
              No posts found.
            </p>
          ) : (
            <div className="space-y-3">
              {engagement.topPosts.map((post, i) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between border-b border-[var(--pm-line)] pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs font-bold text-[var(--pm-muted)]">
                      #{i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--pm-ink)]">
                        {post.title}
                      </p>
                      <span className="text-xs text-[var(--pm-muted)]">
                        in {post.groupSlug}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs text-[var(--pm-muted)]">
                    <span>{post.upvotes} upvotes</span>
                    <span>{post.commentCount} comments</span>
                    <span>{post.viewCount} views</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard Snapshot */}
      <div className="mt-6 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--pm-coral)]" />
          <h3 className="text-sm font-semibold text-[var(--pm-ink)]">
            Top members by reputation
          </h3>
        </div>

        {engagement.topMembers.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--pm-muted)]">
            No members found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--pm-line)] text-xs font-semibold uppercase tracking-wider text-[var(--pm-muted)]">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-right">Reputation</th>
                  <th className="px-3 py-2 text-right">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pm-line)]">
                {engagement.topMembers.map((member, i) => (
                  <tr key={member.id} className="hover:bg-[var(--pm-paper-2)]">
                    <td className="px-3 py-2 text-xs font-bold text-[var(--pm-muted)]">
                      #{i + 1}
                    </td>
                    <td className="px-3 py-2 font-medium text-[var(--pm-ink)]">
                      {member.username}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--pm-coral)]">
                      {member.reputationScore.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--pm-muted)]">
                      {member.streakDays} days
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
