import { createServiceDb } from '@/lib/db';
import { listGlobalLeaderboard } from '@/lib/services/community';
import { LeaderboardTabs } from '../components/LeaderboardTabs';

export default async function LeaderboardsRoute() {
  const db = createServiceDb();

  const [weekly, allTime] = await Promise.all([
    listGlobalLeaderboard(db, 'weekly', 50),
    listGlobalLeaderboard(db, 'all_time', 50),
  ]);

  return <LeaderboardTabs weekly={weekly} allTime={allTime} />;
}
