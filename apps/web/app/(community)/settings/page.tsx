import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getUserMembershipGroups } from '@/lib/services/community';
import { getAvatarReadUrl } from '@/lib/storage';
import { SettingsPage } from '../components/SettingsPage';

export default async function SettingsRoute() {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const db = createServiceDb();
  const userId = session.user.id;

  const [user, memberships] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    getUserMembershipGroups(db, userId),
  ]);

  if (!user) {
    redirect('/login');
  }

  return (
    <SettingsPage
      user={{
        id: user.id,
        email: user.email,
        username: user.username,
        userslug: user.userslug,
        fullName: user.fullName,
        pictureUrl: await getAvatarReadUrl(user.pictureUrl),
        role: user.role,
        preferences: (user.preferences ?? {}) as any,
      }}
      memberships={memberships}
    />
  );
}
