import type { MetadataRoute } from 'next';
import { eq, and } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';

// Sitemap reads the same DB the post/group pages use; node is the default but
// declared explicitly so the route can't be flipped to edge without the build
// complaining (mirrors the post detail page's runtime guard).
export const runtime = 'nodejs';
// Regenerate hourly via ISR — keeps the sitemap off the request hot path and
// off the DB pool except once per revalidation window.
export const revalidate = 3600;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://promptmetrics.dev').replace(/\/$/, '');

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

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/feed`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1.0 },
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

  return [...staticEntries, ...groupEntries, ...postEntries];
}