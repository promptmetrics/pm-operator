import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import { NotificationsPage } from '../components/NotificationsPage';

export default async function NotificationsRoute() {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }
  return <NotificationsPage currentUserId={session.user.id} />;
}
