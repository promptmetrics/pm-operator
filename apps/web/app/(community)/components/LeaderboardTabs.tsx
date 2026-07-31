'use client';

import * as React from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import type { LeaderboardEntry } from '@pm-operator/api';

type Period = 'weekly' | 'all_time';

interface LeaderboardTabsProps {
  weekly: LeaderboardEntry[];
  allTime: LeaderboardEntry[];
}

export function LeaderboardTabs({ weekly, allTime }: LeaderboardTabsProps) {
  const [period, setPeriod] = React.useState<Period>('weekly');
  const entries = period === 'weekly' ? weekly : allTime;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Trophy className="h-6 w-6 text-amber-500" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Leaderboards</h1>
      </div>

      <div className="mb-4 flex gap-2">
        <Button variant={period === 'weekly' ? 'primary' : 'secondary'} size="sm" onClick={() => setPeriod('weekly')}>
          This week
        </Button>
        <Button variant={period === 'all_time' ? 'primary' : 'secondary'} size="sm" onClick={() => setPeriod('all_time')}>
          All time
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium text-right">Score</th>
              <th className="px-4 py-3 font-medium text-right">Solutions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.userslug} className="hover:bg-muted/50">
                <td className="px-4 py-3 font-semibold">{entry.rank}</td>
                <td className="px-4 py-3">
                  <Link href={`/u/${entry.userslug}`} className="flex items-center gap-2 hover:text-primary">
                    <Avatar src={undefined} alt={entry.username} fallback={entry.username} size="sm" />
                    <span className="font-medium">{entry.username}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">{entry.score}</td>
                <td className="px-4 py-3 text-right">{entry.acceptedSolutions}</td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No scores yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
