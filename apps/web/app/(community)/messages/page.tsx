import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import { MessagesInbox } from '../components/MessagesInbox';

export default async function MessagesRoute() {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }
  return <MessagesInbox />;
}