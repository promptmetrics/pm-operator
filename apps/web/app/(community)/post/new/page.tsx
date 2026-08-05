import { redirect } from 'next/navigation';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getWritableGroups } from '@/lib/services/community';
import { CreatePostForm } from '../../components/CreatePostForm';
import { PostType } from '@pm-operator/api';

type PageSearchParams = Record<string, string | string[] | undefined>;

const VALID_TYPES: PostType[] = ['question', 'build', 'discussion'];

export default async function NewPostRoute({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params = await searchParams;
  const db = createServiceDb();
  const { session } = await getSession();
  const currentUserId = session?.user?.id;

  if (!currentUserId) {
    redirect('/login');
  }

  const writableGroups = await getWritableGroups(db, currentUserId);
  if (writableGroups.length === 0) {
    redirect('/feed');
  }

  const groupParam = typeof params.group === 'string' ? params.group : undefined;
  const typeParam = typeof params.type === 'string' ? params.type : undefined;
  const defaultGroupSlug = writableGroups.some((g) => g.slug === groupParam)
    ? groupParam
    : writableGroups[0]?.slug;
  const defaultType: PostType | undefined = VALID_TYPES.includes(typeParam as PostType)
    ? (typeParam as PostType)
    : undefined;

  return (
    <CreatePostForm
      groups={writableGroups}
      defaultGroupSlug={defaultGroupSlug}
      defaultType={defaultType}
    />
  );
}
