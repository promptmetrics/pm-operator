import type { MetadataRoute } from 'next';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getPublicSiteUrl } from '@/lib/site-url';

// Sitemap reads the same DB the post/group pages use; node is the default but
// declared explicitly so the route can't be flipped to edge without the build
// complaining (mirrors the post detail page's runtime guard).
export const runtime = 'nodejs';
// Force dynamic: like every other DB-backed route in this app, render on
// demand at runtime. A `revalidate` value would make Next ISR-prerender the
// route at build time, which calls createServiceDb() — and the CI build
// environment has no DATABASE_URL, so that fails the build. force-dynamic
// skips build-time prerender entirely; DATABASE_URL is present at runtime.
export const dynamic = 'force-dynamic';

// Shared with the canonical the post and circle pages emit. These must agree
// byte for byte or Google reports a canonical/sitemap mismatch, so both sides
// go through one helper rather than two copies of the same expression.
const SITE_URL = getPublicSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createServiceDb();

  // Two lightweight queries, run in parallel. The post predicate mirrors
  // postVisibilityFilter(undefined) — the anon allowlist in lib/services/posts.ts
  // (groups.visibility='public' AND posts.status='published') — so the sitemap can
  // never advertise a URL an anonymous reader couldn't load. If that branch changes,
  // update this predicate to match.
  //
  // Single sitemap.xml covers up to 50k URLs (Google's per-file limit). When posts
  // approach that, split via generateSitemaps() paging posts by id/updatedAt.
  const [groupRows, postRows] = await Promise.all([
    db.select({ slug: schema.groups.slug, updatedAt: schema.groups.updatedAt })
      .from(schema.groups)
      .where(eq(schema.groups.visibility, 'public')),
    db.select({
      postSlug: schema.posts.slug,
      groupSlug: schema.groups.slug,
      updatedAt: schema.posts.updatedAt,
    })
      .from(schema.posts)
      .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
      .where(
        and(
          eq(schema.posts.status, 'published'),
          eq(schema.groups.visibility, 'public'),
        ),
      ),
  ]);

  // Author pages: only users with at least one anonymously-visible post, so
  // the sitemap never advertises an empty profile (thin-content risk) and the
  // predicate stays in lockstep with the post query above. Second wave on
  // purpose — the Promise.all above already fills the request's query budget.
  const authorRows = await db
    .select({
      userslug: schema.users.userslug,
      lastPostAt: sql<Date>`max(${schema.posts.updatedAt})`,
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
    .where(
      and(
        eq(schema.posts.status, 'published'),
        eq(schema.groups.visibility, 'public'),
      ),
    )
    .groupBy(schema.users.userslug);

  // /feed's lastmod is the newest content change, NOT the render time: a
  // request-time `new Date()` returned a different value on every fetch, and
  // Google treats detected-fake lastmod as a reason to distrust the whole
  // sitemap. With no posts yet the field is omitted rather than faked.
  const newestPostAt = postRows.reduce<Date | undefined>(
    (max, p) => (!max || p.updatedAt > max ? p.updatedAt : max),
    undefined
  );

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/feed`, lastModified: newestPostAt, changeFrequency: 'hourly', priority: 1.0 },
  ];

  const groupEntries: MetadataRoute.Sitemap = groupRows.map((g) => ({
    url: `${SITE_URL}/g/${g.slug}`,
    lastModified: g.updatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const postEntries: MetadataRoute.Sitemap = postRows.map((p) => ({
    url: `${SITE_URL}/g/${p.groupSlug}/${p.postSlug}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const authorEntries: MetadataRoute.Sitemap = authorRows.map((a) => ({
    url: `${SITE_URL}/u/${a.userslug}`,
    lastModified: a.lastPostAt,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [...staticEntries, ...groupEntries, ...postEntries, ...authorEntries];
}