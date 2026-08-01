import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { ModerationQueue } from '@/components/ModerationQueue';

export default async function ModerationPage() {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login?returnUrl=/moderation');
  }

  const db = createServiceDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { role: true },
  });

  if (user?.role !== 'admin' && user?.role !== 'moderator') {
    redirect('/feed');
  }

  return (
    <div className="px-4 py-6">
      <ModerationQueue />
    </div>
  );
}
