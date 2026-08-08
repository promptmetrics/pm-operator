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

// The rail renders on EVERY community navigation, so its data budget stays
// flat (pool = 3; see DESIGN-GAP-REPORT "Pool-starvation gotcha"): logged-out
// viewers are served from a 5-minute cache (zero fresh queries on most
// requests); logged-in viewers cost exactly one query. Post counts wait for
// the cacheable groups-list stats aggregate (Phase 2C).
const listPublicRailCircles = unstable_cache(
  async (): Promise<RailCircle[]> => {
    const db = createServiceDb();
    const rows = await db
      .select({
        slug: schema.groups.slug,
        name: schema.groups.name,
        color: schema.groups.color,
      })
      .from(schema.groups)
      .where(eq(schema.groups.visibility, 'public'))
      .orderBy(schema.groups.name);
    return rows.map((row) => ({ ...row, joined: false }));
  },
  ['rail-public-circles'],
  { revalidate: 300 }
);

// Visibility mirrors lib/services/community.ts listGroupsWithPostCounts:
// public groups plus groups the viewer created or belongs to. The LEFT JOIN
// doubles as the joined ✓ marker, keeping this to a single query.
async function listViewerRailCircles(userId: string): Promise<RailCircle[]> {
  const db = createServiceDb();
  return db
    .select({
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

  const circles = currentUserId
    ? await listViewerRailCircles(currentUserId)
    : await listPublicRailCircles();

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
