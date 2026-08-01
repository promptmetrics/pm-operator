export const runtime = 'nodejs';

import { eq, sql } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { getSession } from '@/lib/auth/server';
import { getDb, ok, notFound, rateLimit, getClientIp } from '@/lib/api/server';
import { getUserBadges } from '@/lib/services/badges';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { session } = await getSession();
  if (!session?.user) {
    const limited = await rateLimit('anonymousPublicRead', getClientIp(request));
    if (limited) return limited;
  }

  const { slug } = await params;
  const user = await getDb().query.users.findFirst({
    where: eq(sql`lower(${schema.users.userslug})`, slug.toLowerCase()),
    columns: { id: true },
  });
  if (!user) return notFound('User not found');

  const badges = await getUserBadges(getDb(), user.id);
  return ok(badges);
}
