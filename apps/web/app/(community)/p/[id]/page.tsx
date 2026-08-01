import { eq, and } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getPostById, listGroupPosts } from '@/lib/services/posts';
import { getAvatarReadUrl } from '@/lib/storage';
import { PostDetailPage } from '../../components/PostDetailPage';

export default async function PostRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  const post = await getPostById(db, id, currentUserId);

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
