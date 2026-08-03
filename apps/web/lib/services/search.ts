import { eq, and, or, sql, desc, count } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { SearchQuery, SearchResponse, SearchResult, PostType } from '@pm-operator/api';
import { levelForScore } from '@pm-operator/api';
import { toISO, toNumber } from './shared';

function sanitizeTsQueryTerm(term: string): string | null {
  // Keep letters, numbers, and underscores; drop tsquery operators and punctuation.
  const cleaned = term.replace(/[^\p{L}\p{N}_]/gu, '');
  return cleaned.length > 0 ? `${cleaned}:*` : null;
}

function postVisibilityFilter(currentUserId: string | undefined) {
  const notDeleted = sql`${schema.posts.status} <> 'deleted'`;
  if (!currentUserId) {
    return and(
      notDeleted,
      sql`${schema.groups.visibility} = 'public'`,
      sql`${schema.posts.status} <> 'hidden'`
    );
  }
  const isAuthor = eq(schema.posts.authorId, currentUserId);
  const isAdmin = sql`exists (
    select 1 from ${schema.users}
    where ${schema.users.id} = ${currentUserId} and ${schema.users.role} = 'admin'
  )`;
  return and(
    notDeleted,
    or(
      sql`${schema.groups.visibility} = 'public'`,
      isAuthor,
      sql`exists (
        select 1 from ${schema.groupMemberships}
        where ${schema.groupMemberships.groupId} = ${schema.posts.groupId}
          and ${schema.groupMemberships.userId} = ${currentUserId}
      )`,
      isAdmin
    ),
    or(
      sql`${schema.posts.status} <> 'hidden'`,
      isAuthor,
      isAdmin,
      sql`exists (
        select 1 from ${schema.groupMemberships}
        where ${schema.groupMemberships.groupId} = ${schema.posts.groupId}
          and ${schema.groupMemberships.userId} = ${currentUserId}
          and ${schema.groupMemberships.role} in ('admin', 'moderator')
      )`
    )
  );
}

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

  const mapped: SearchResult[] = results.map((r) => ({
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
    createdAt: toISO(r.post.createdAt),
    rank: Number(r.rank ?? 0),
  }));

  return { results: mapped, nextCursor };
}
