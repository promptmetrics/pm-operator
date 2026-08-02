import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import { MessageThread } from '../../components/MessageThread';

export default async function ConversationRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }
  const { id } = await params;
  return <MessageThread conversationId={id} currentUserId={session.user.id} />;
}