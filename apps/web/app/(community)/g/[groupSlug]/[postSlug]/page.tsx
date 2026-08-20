import { eq, and } from 'drizzle-orm';
import type { Metadata } from 'next';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getPostBySlug, listGroupPosts } from '@/lib/services/posts';
import { listCommentsForPost } from '@/lib/services/comments';
import { getAvatarReadUrl } from '@/lib/storage';
import { resolvePostShareImage } from '@/lib/og-image';
import { getPublicSiteUrl } from '@/lib/site-url';
import { buildPostJsonLd, serializeJsonLd } from '@/lib/seo/post-jsonld';
import { buildBreadcrumbJsonLd } from '@/lib/seo/site-jsonld';
import { metaDescription } from '@/lib/seo/meta-description';
import { PostDetailPage } from '../../../components/PostDetailPage';

// generateMetadata reaches lib/og-image -> services/safe-fetch, which uses
// node:dns. Node is already the default for pages; this makes the dependency
// explicit so the route can't be flipped to edge without the build complaining.
export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupSlug: string; postSlug: string }>;
}): Promise<Metadata> {
  const { groupSlug, postSlug } = await params;
  const siteUrl = getPublicSiteUrl();

  const db = createServiceDb();
  const post = await getPostBySlug(db, groupSlug, postSlug, undefined);

  if (!post) {
    // This branch still answers 200 with a placeholder body (access-matrix.spec.ts
    // asserts the text is visible), so without noindex Google files it as a soft
    // 404 — and soft 404s are charged against the whole host's crawl quality,
    // which is the opposite of what we need on this subdomain.
    return { title: 'Removed by moderator', robots: { index: false, follow: false } };
  }

  const description = metaDescription(post.contentPlain || post.title);
  const image = await resolvePostShareImage(post.coverImageUrl, post.content);
  const canonical = `${siteUrl}/g/${groupSlug}/${postSlug}`;

  return {
    title: post.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description,
      url: canonical,
      type: 'article',
      images: image ? [{ url: image, alt: post.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PostBySlugRoute({
  params,
}: {
  params: Promise<{ groupSlug: string; postSlug: string }>;
}) {
  const { groupSlug, postSlug } = await params;
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const post = await getPostBySlug(db, groupSlug, postSlug, currentUserId);

  if (!post) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-12 text-center">
        <h1 className="text-xl font-semibold">Removed by moderator</h1>
        <p className="mt-2 text-[var(--pm-muted)]">This content is no longer available.</p>
      </div>
    );
  }

  const [viewer, membership, morePosts] = await Promise.all([
    currentUserId
      ? db.query.users.findFirst({
          where: eq(schema.users.id, currentUserId),
          columns: { role: true, username: true, fullName: true, pictureUrl: true },
        })
      : Promise.resolve(undefined),
    currentUserId
      ? db.query.groupMemberships.findFirst({
          where: and(
            eq(schema.groupMemberships.groupId, post.groupId),
            eq(schema.groupMemberships.userId, currentUserId)
          ),
          columns: { userId: true },
        })
      : Promise.resolve(undefined),
    listGroupPosts(
      db,
      post.group.slug,
      { filter: 'all', sort: 'new', page: 1, limit: 3 },
      currentUserId,
      { excludePostId: post.id }
    ),
  ]);

  const viewerPictureUrl = await getAvatarReadUrl(viewer?.pictureUrl);

  // Server-render page 1 of the thread. Sequential on purpose: the Promise.all
  // above is already at the 3-query concurrency budget the pool allows, and a
  // 4th parallel branch is how the pool got starved before.
  //
  // 'top' must match PostDetailPage's default sort, or the list reorders the
  // moment it hydrates.
  const initialComments = await listCommentsForPost(db, post.id, currentUserId, {
    sort: 'top',
    limit: 20,
    offset: 0,
  });

  // Same expression as generateMetadata's canonical — one origin helper, so the
  // canonical, the sitemap entry and this URL cannot drift apart.
  const siteUrl = getPublicSiteUrl();
  const canonical = `${siteUrl}/g/${groupSlug}/${postSlug}`;
  const jsonLd = buildPostJsonLd(post, canonical);
  const breadcrumbJsonLd = jsonLd
    ? buildBreadcrumbJsonLd([
        { name: 'Community', url: `${siteUrl}/feed` },
        { name: post.group.name, url: `${siteUrl}/g/${groupSlug}` },
        { name: post.title, url: canonical },
      ])
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
        />
      ) : null}
      <PostDetailPage
        post={post}
        initialComments={initialComments.comments}
        initialAcceptedComment={initialComments.acceptedComment}
        initialHasMore={initialComments.hasMore}
        initialTotal={initialComments.total}
        currentUserId={currentUserId}
        viewerRole={viewer?.role}
        viewerIsMember={Boolean(membership)}
        viewer={
          viewer
            ? {
                username: viewer.username,
                fullName: viewer.fullName,
                pictureUrl: viewerPictureUrl,
              }
            : undefined
        }
        morePosts={morePosts.posts}
      />
    </>
  );
}
