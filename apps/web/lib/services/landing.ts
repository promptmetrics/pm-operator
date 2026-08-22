// Landing page data for `/`, rebuilt at most once a day.
//
// Cache shape follows the group-stats precedent (group-stats-cache.ts):
//   - a single unstable_cache entry, revalidate 86400 (24h), so a warm request
//     costs ZERO queries — the copy handover explicitly wanted no per-request
//     COUNT queries or PostHog calls.
//   - the DB client is created INSIDE the cached function: unstable_cache
//     freezes whatever closes over the call site, and a client captured at
//     module scope would outlive serverless warm instances.
//
// Pool budget (pool = 3, DB pool starvation trap): worst case a recompute runs
// THREE queries, strictly sequential — one combined counts statement, one
// curated-slug lookup, and at most one recent-posts backfill when fewer than
// PROOF_ROW_COUNT curated slugs still resolve. No Promise.all anywhere in
// here on purpose; query-budget-units.vitest.ts source-scans this file.

import { unstable_cache } from 'next/cache';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { PROOF_POST_SLUGS, PROOF_ROW_COUNT } from '@/landing-copy';

export interface LandingProofPost {
  slug: string;
  groupSlug: string;
  title: string;
  excerpt: string;
  authorName: string;
}

export interface LandingData {
  memberCount: number;
  postCount: number;
  proofPosts: LandingProofPost[];
}

// Word-boundary truncate for the proof rows. The mockup's excerpts end with a
// single '…', so the separator is that glyph, never '...'.
function excerpt(text: string, max = 170): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${clean.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

interface ProofRow {
  slug: string;
  groupSlug: string;
  title: string;
  contentPlain: string;
  fullName: string | null;
  username: string;
}

function toProofPost(row: ProofRow): LandingProofPost {
  return {
    slug: row.slug,
    groupSlug: row.groupSlug,
    title: row.title,
    excerpt: excerpt(row.contentPlain),
    authorName: row.fullName ?? row.username,
  };
}

// The anon-visibility predicate, mirroring postVisibilityFilter(undefined) and
// the sitemap's branch: published post in a public group. Keep all three
// copies in lockstep.
const PUBLIC_POST = and(
  eq(schema.posts.status, 'published'),
  eq(schema.groups.visibility, 'public')
);

async function computeLandingData(): Promise<LandingData> {
  const db = createServiceDb();

  // Query 1 of max 3: both headline counts in a single statement so the
  // recompute stays inside the 3-query budget even when backfill runs.
  const countRows = await db.execute<{ memberCount: number; postCount: number }>(sql`
    select
      (select count(*)::int from users) as "memberCount",
      (select count(*)::int
         from posts p
         inner join groups g on g.id = p.group_id
        where p.status = 'published'
          and g.visibility = 'public') as "postCount"
  `);
  const counts = countRows[0] ?? { memberCount: 0, postCount: 0 };

  // Query 2: the curated slugs, restored to display order in JS (IN lists
  // return in no guaranteed order).
  const curated = PROOF_POST_SLUGS.length
    ? await db
        .select({
          slug: schema.posts.slug,
          groupSlug: schema.groups.slug,
          title: schema.posts.title,
          contentPlain: schema.posts.contentPlain,
          fullName: schema.users.fullName,
          username: schema.users.username,
        })
        .from(schema.posts)
        .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
        .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(and(PUBLIC_POST, inArray(schema.posts.slug, [...PROOF_POST_SLUGS])))
    : [];

  const displayOrder = new Map<string, number>(
    PROOF_POST_SLUGS.map((slug, index) => [slug as string, index])
  );
  const ordered = curated
    .slice()
    .sort((a, b) => (displayOrder.get(a.slug) ?? 0) - (displayOrder.get(b.slug) ?? 0));

  // Query 3, only when needed: top off missing slots with the most recent
  // public posts the curation list doesn't already cover.
  const missing = PROOF_ROW_COUNT - ordered.length;
  if (missing > 0) {
    const fetchedSlugs = ordered.map((row) => row.slug);
    const recent = await db
      .select({
        slug: schema.posts.slug,
        groupSlug: schema.groups.slug,
        title: schema.posts.title,
        contentPlain: schema.posts.contentPlain,
        fullName: schema.users.fullName,
        username: schema.users.username,
      })
      .from(schema.posts)
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
      .where(
        fetchedSlugs.length
          ? and(PUBLIC_POST, notInArray(schema.posts.slug, fetchedSlugs))
          : PUBLIC_POST
      )
      .orderBy(desc(schema.posts.createdAt))
      .limit(missing);
    ordered.push(...recent);
  }

  return {
    memberCount: Number(counts.memberCount),
    postCount: Number(counts.postCount),
    proofPosts: ordered.map(toProofPost),
  };
}

export const getLandingData = unstable_cache(computeLandingData, ['landing-page-data'], {
  revalidate: 86400,
});
