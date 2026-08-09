import { eq, and, or, sql, desc, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  SearchQuery,
  SearchResponse,
  SearchResult,
  PostType,
  PaletteResponse,
} from '@pm-operator/api';
import { levelForScore } from '@pm-operator/api';
import { toISO, toNumber, toExcerpt } from './shared';
import { postVisibilityFilter } from './posts';
import { getPostImageReadUrl, getAvatarReadUrl } from '../storage';

function sanitizeTsQueryTerm(term: string): string | null {
  // Keep letters, numbers, and underscores; drop tsquery operators and punctuation.
  const cleaned = term.replace(/[^\p{L}\p{N}_]/gu, '');
  return cleaned.length > 0 ? `${cleaned}:*` : null;
}

// Post visibility comes from posts.ts (imported above). This file used to keep
// a byte-for-byte copy, and copies go stale: the shared filter was corrected to
// hide declined (`draft`) and `flagged` posts, and a private copy here would
// have kept serving them in search results. Import it; don't re-derive it.

export async function searchPosts(
  db: DrizzleClient,
  query: SearchQuery,
  currentUserId?: string,
  postType?: PostType
): Promise<SearchResponse> {
  const { q, groupSlug, tags, sort, page, limit } = query;
  const tsQuery = q
    .split(/\s+/)
    .filter(Boolean)
    .map(sanitizeTsQueryTerm)
    .filter((term): term is string => term !== null)
    .join(' & ');

  const asCount = db.$with('as_count').as(
    db
      .select({
        userId: schema.comments.authorId,
        count: count().as('count'),
      })
      .from(schema.comments)
      .innerJoin(schema.posts, eq(schema.posts.acceptedCommentId, schema.comments.id))
      .groupBy(schema.comments.authorId)
  );

  const conditions = [
    postVisibilityFilter(currentUserId),
    sql`to_tsvector('simple', ${schema.posts.contentPlain}) || to_tsvector('simple', ${schema.posts.title}) @@ to_tsquery('simple', ${tsQuery})`,
  ];

  if (groupSlug) {
    conditions.push(eq(schema.groups.slug, groupSlug));
  }
  if (postType) {
    conditions.push(eq(schema.posts.type, postType));
  }
  if (tags && tags.length > 0) {
    conditions.push(
      sql`${schema.posts.tags} && ${sql`ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[]`}`
    );
  }

  const rankSql = sql<number>`
    ts_rank(
      to_tsvector('simple', ${schema.posts.contentPlain}) || to_tsvector('simple', ${schema.posts.title}),
      to_tsquery('simple', ${tsQuery})
    ) * case when ${schema.posts.acceptedCommentId} is not null then 1.4 else 1.0 end
  `.as('rank');

  let orderBy;
  switch (sort) {
    case 'new':
      orderBy = [desc(schema.posts.createdAt)];
      break;
    case 'top':
      orderBy = [desc(schema.posts.upvotes), desc(rankSql)];
      break;
    default:
      orderBy = [desc(rankSql), desc(schema.posts.createdAt)];
  }

  const rows = await db
    .with(asCount)
    .select({
      post: schema.posts,
      group: schema.groups,
      author: schema.users,
      rank: rankSql,
      acceptedSolutions: asCount.count,
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .leftJoin(asCount, eq(asCount.userId, schema.users.id))
    .where(and(...conditions.filter(Boolean)))
    .orderBy(...orderBy)
    .limit(limit + 1)
    .offset((page - 1) * limit);

  const hasMore = rows.length > limit;
  const results = rows.slice(0, limit);
  const last = results[results.length - 1];
  const nextCursor = hasMore && last ? toISO(last.post.createdAt) : undefined;

  const mapped: SearchResult[] = await Promise.all(
    results.map(async (r) => ({
      id: r.post.id,
      slug: r.post.slug,
      title: r.post.title,
      type: r.post.type,
      status: r.post.status,
      isSolved: r.post.acceptedCommentId !== null,
      group: { slug: r.group.slug, name: r.group.name },
      author: {
        userslug: r.author.userslug,
        username: r.author.username,
        reputationScore: toNumber(r.author.reputationScore),
        acceptedSolutions: toNumber(r.acceptedSolutions),
        level: levelForScore(toNumber(r.author.reputationScore)).level,
      },
      upvotes: r.post.upvotes,
      commentCount: r.post.commentCount,
      viewCount: r.post.viewCount,
      tags: r.post.tags,
      excerpt: toExcerpt(r.post.contentPlain),
      createdAt: toISO(r.post.createdAt),
      coverImageUrl: await getPostImageReadUrl(r.post.coverImageUrl),
      rank: Number(r.rank ?? 0),
    }))
  );

  return { results: mapped, nextCursor };
}

// --- ⌘K command palette (redesign plan §4.2) ---

// Escape LIKE/ILIKE wildcards so user input matches literally. Postgres treats
// backslash as the default escape character.
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Mirrored from groups.ts groupVisibilityFilter (which mirrors RLS): public
// groups, groups the viewer belongs to, or groups the viewer created. Kept
// local for the same reason postVisibilityFilter is mirrored above — this
// service runs on the service-role connection and must re-apply RLS scoping.
function groupVisibilityFilter(currentUserId: string | undefined) {
  const publicFilter = sql`${schema.groups.visibility} = 'public'`;
  if (!currentUserId) return publicFilter;
  return or(
    publicFilter,
    eq(schema.groups.createdBy, currentUserId),
    sql`exists (
      select 1 from ${schema.groupMemberships}
      where ${schema.groupMemberships.groupId} = ${schema.groups.id}
        and ${schema.groupMemberships.userId} = ${currentUserId}
    )`
  );
}

// Command-palette search. DB pool budget (pool max = 3, shared across the
// instance): the three lookups run as sequential awaits so this request path
// never holds more than one connection at a time. Do NOT convert to
// Promise.all — a wide fan-out here starves the pool (2026-08-02 outage).
export async function getPaletteResults(
  db: DrizzleClient,
  q: string,
  viewerId?: string
): Promise<PaletteResponse> {
  const likeTerm = escapeLikePattern(q);

  // (1) Circles: name contains-match, scoped to groups the viewer can see.
  const circleRows = await db
    .select({
      id: schema.groups.id,
      slug: schema.groups.slug,
      name: schema.groups.name,
      memberCount: schema.groups.memberCount,
    })
    .from(schema.groups)
    .where(
      and(
        groupVisibilityFilter(viewerId),
        sql`${schema.groups.name} ilike ${'%' + likeTerm + '%'}`
      )
    )
    .orderBy(desc(schema.groups.memberCount))
    .limit(3);

  // (2) Posts: reuse the FTS query above (searchPosts applies
  // postVisibilityFilter). Skip when q sanitizes to no indexable terms —
  // to_tsquery('simple', '') would error.
  const hasIndexableTerm = q
    .split(/\s+/)
    .filter(Boolean)
    .some((term) => sanitizeTsQueryTerm(term) !== null);
  const postSearch: SearchResponse = hasIndexableTerm
    ? await searchPosts(db, { q, sort: 'relevance', page: 1, limit: 5 }, viewerId)
    : { results: [] };

  // (3) People: same username prefix match as the mention-autocomplete route
  // (app/api/v1/users/search). Profiles are public, so no viewer scoping.
  const userRows = await db.query.users.findMany({
    where: sql`lower(${schema.users.username}) like ${likeTerm.toLowerCase() + '%'}`,
    limit: 3,
  });

  // Avatar resolution is a Storage call, not a DB query (max 3 wide — same
  // pattern as the mention-search route).
  const people = await Promise.all(
    userRows.map(async (u) => ({
      id: u.id,
      slug: u.userslug,
      name: u.username,
      avatarUrl: await getAvatarReadUrl(u.pictureUrl),
    }))
  );

  return {
    circles: circleRows.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      memberCount: toNumber(g.memberCount),
    })),
    posts: postSearch.results.map((r) => ({
      id: r.id,
      title: r.title,
      circleSlug: r.group.slug,
      circleName: r.group.name,
    })),
    people,
  };
}
