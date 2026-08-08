import * as React from 'react';
import { unstable_cache } from 'next/cache';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { Header } from './components/Header';
import { RealtimeProvider } from './components/RealtimeProvider';
import { RailProvider } from './components/RailProvider';
import { LeftRail, type RailCircle } from './components/LeftRail';
import { getCachedGroupStats } from '@/lib/services/group-stats-cache';

// Circle rows before the cached stats merge — post counts are attached from
// the shared groups-list-stats cache in the layout body, never queried here.
type RailCircleBase = Omit<RailCircle, 'postsThisMonth'>;

// The rail renders on EVERY community navigation, so its data budget stays
// flat (pool = 3; see DESIGN-GAP-REPORT "Pool-starvation gotcha"): logged-out
// viewers are served from a 5-minute cache (zero fresh queries on most
// requests); logged-in viewers cost exactly one query. Post counts come from
// the shared groups-list stats cache (Phase 2C), merged below.
const listPublicRailCircles = unstable_cache(
  async (): Promise<RailCircleBase[]> => {
    const db = createServiceDb();
    const rows = await db
      .select({
        id: schema.groups.id,
        slug: schema.groups.slug,
        name: schema.groups.name,
        color: schema.groups.color,
      })
      .from(schema.groups)
      .where(eq(schema.groups.visibility, 'public'))
      .orderBy(schema.groups.name);
    return rows.map((row) => ({ ...row, joined: false }));
  },
  // v2: rows gained `id` (stats-map lookup key); the bumped key avoids
  // serving stale-shaped entries for up to 300 s after deploy.
  ['rail-public-circles-v2'],
  { revalidate: 300 }
);

// Visibility mirrors lib/services/community.ts listGroupsWithPostCounts:
// public groups plus groups the viewer created or belongs to. The LEFT JOIN
// doubles as the joined ✓ marker, keeping this to a single query.
async function listViewerRailCircles(userId: string): Promise<RailCircleBase[]> {
  const db = createServiceDb();
  return db
    .select({
      id: schema.groups.id,
      slug: schema.groups.slug,
      name: schema.groups.name,
      color: schema.groups.color,
      joined: sql<boolean>`${schema.groupMemberships.userId} is not null`,
    })
    .from(schema.groups)
    .leftJoin(
      schema.groupMemberships,
      and(
        eq(schema.groupMemberships.groupId, schema.groups.id),
        eq(schema.groupMemberships.userId, userId)
      )
    )
    .where(
      or(
        sql`${schema.groups.visibility} = 'public'`,
        eq(schema.groups.createdBy, userId),
        isNotNull(schema.groupMemberships.userId)
      )
    )
    .orderBy(schema.groups.name);
}

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const baseCircles = currentUserId
    ? await listViewerRailCircles(currentUserId)
    : await listPublicRailCircles();

  // Post counts come ONLY from the shared 300 s cache (key 'groups-list-stats',
  // same entry as GET /api/v1/groups?includeStats=1). Awaited AFTER the rail
  // query — never concurrent — so the per-navigation budget stays 1 fresh
  // query warm (2 sequential on a cold cache).
  const statsMap = await getCachedGroupStats();
  const circles: RailCircle[] = baseCircles.map((circle) => ({
    ...circle,
    postsThisMonth: statsMap[circle.id]?.postsThisMonth ?? 0,
  }));

  return (
    <RealtimeProvider>
      <RailProvider>
        <div className="flex min-h-screen flex-col">
          <Header />
          <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
            <LeftRail circles={circles} />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </RailProvider>
    </RealtimeProvider>
  );
}
