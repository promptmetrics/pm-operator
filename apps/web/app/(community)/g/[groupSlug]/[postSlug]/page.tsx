import { eq, and } from 'drizzle-orm';
import type { Metadata } from 'next';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getPostBySlug, listGroupPosts } from '@/lib/services/posts';
import { getAvatarReadUrl } from '@/lib/storage';
import { resolvePostShareImage } from '@/lib/og-image';
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://promptmetrics.dev';

  const db = createServiceDb();
  const post = await getPostBySlug(db, groupSlug, postSlug, undefined);

  if (!post) {
    return { title: 'Removed by moderator' };
  }

  const description = (post.contentPlain || post.title).slice(0, 160);
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

  return (
    <PostDetailPage
      post={post}
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
  );
}
