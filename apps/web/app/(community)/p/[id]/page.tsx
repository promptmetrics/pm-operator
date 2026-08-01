import { notFound } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getPostById } from '@/lib/services/posts';
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

  return <PostDetailPage post={post} currentUserId={currentUserId} />;
}
