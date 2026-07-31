import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getGroupBySlug } from '@/lib/services/groups';
import { listGroupPosts } from '@/lib/services/posts';
import { listPinnedPosts, listGroupLeaderboard, getWritableGroups } from '@/lib/services/community';
import { FeedPage } from '../../components/FeedPage';
import { FeedCard } from '../../components/FeedCard';
import { GroupMembershipButton } from '../../components/GroupMembershipButton';
import { GroupInviteButton } from '../../components/GroupInviteButton';
import { FeedFilter } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function GroupRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const { slug } = await params;
  const paramsQuery = await searchParams;

  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const group = await getGroupBySlug(db, slug, currentUserId);
  if (!group) notFound();

  const filterParam = typeof paramsQuery.filter === 'string' ? paramsQuery.filter : undefined;
  const filter: FeedFilter = Object.values(FeedFilter).includes(filterParam as FeedFilter)
    ? (filterParam as FeedFilter)
    : FeedFilter.ALL;
  const pageParam = typeof paramsQuery.page === 'string' ? Number(paramsQuery.page) : undefined;
  const page = Number.isFinite(pageParam) && pageParam && pageParam > 0 ? pageParam : 1;

  const [membership, pinned, { posts, nextCursor }, leaderboard, writableGroups, currentUser] =
    await Promise.all([
      currentUserId
        ? db.query.groupMemberships.findFirst({
            where: and(
              eq(schema.groupMemberships.groupId, group.id),
              eq(schema.groupMemberships.userId, currentUserId)
            ),
          })
        : Promise.resolve(null),
      listPinnedPosts(db, group.id, currentUserId),
      listGroupPosts(db, slug, { filter, sort: 'new', page, limit: 20 }, currentUserId),
      listGroupLeaderboard(db, group.id, 'weekly', 5),
      currentUserId ? getWritableGroups(db, currentUserId) : Promise.resolve([]),
      currentUserId
        ? db.query.users.findFirst({
            where: eq(schema.users.id, currentUserId),
            columns: { role: true },
          })
        : Promise.resolve(null),
    ]);

  const canInvite =
    membership?.role === 'admin' ||
    membership?.role === 'moderator' ||
    currentUser?.role === 'admin';

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {group.color ? (
              <span
                className="inline-block h-10 w-10 rounded-full"
                style={{ backgroundColor: group.color }}
                aria-hidden="true"
              />
            ) : null}
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-2xl font-semibold">{group.name}</h1>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                  {group.visibility.replace('_', ' ')}
                </span>
              </div>
              {group.description ? (
                <p className="text-sm text-muted-foreground">{group.description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canInvite ? <GroupInviteButton slug={slug} /> : null}
            <GroupMembershipButton
              slug={slug}
              initialIsMember={Boolean(membership)}
              isLoggedIn={Boolean(currentUserId)}
            />
          </div>
        </div>
      </div>

      {pinned.length > 0 ? (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold">Pinned</p>
          <div className="flex flex-col gap-3">
            {pinned.map((post) => (
              <FeedCard key={post.id} post={post} currentUserId={currentUserId} />
            ))}
          </div>
        </div>
      ) : null}

      <FeedPage
        initialPosts={posts}
        initialFilter={filter}
        initialCursor={nextCursor}
        currentUserId={currentUserId}
        writableGroups={writableGroups}
        leaderboard={leaderboard}
        groupSlug={slug}
      />
    </div>
  );
}
