import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { listLeaderboard, getLeaderboardViewer } from '@/lib/services/community';
import { LeaderboardTabs } from '../components/LeaderboardTabs';

export default async function LeaderboardsRoute() {
  const db = createServiceDb();
  const { session } = await getSession();
  const userId = session?.user?.id;

  const board = { period: 'weekly', type: 'points' } as const;

  const [entries, viewer] = await Promise.all([
    listLeaderboard(db, { ...board, limit: 50 }),
    userId ? getLeaderboardViewer(db, userId, board) : Promise.resolve(null),
  ]);

  return <LeaderboardTabs initialEntries={entries} initialViewer={viewer} />;
}
