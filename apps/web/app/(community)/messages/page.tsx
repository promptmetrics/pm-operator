import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import { MessagesTwoPane } from '../components/MessagesTwoPane';

export default async function MessagesRoute() {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }
  // currentUserId comes from the session already loaded above — the thread pane
  // needs it to align own/partner bubbles, and it costs no extra query.
  return <MessagesTwoPane currentUserId={session.user.id} />;
}