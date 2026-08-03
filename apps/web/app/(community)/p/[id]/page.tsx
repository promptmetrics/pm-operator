import { permanentRedirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';

export default async function LegacyPostRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceDb();

  const row = await db
    .select({
      slug: schema.posts.slug,
      status: schema.posts.status,
      groupSlug: schema.groups.slug,
    })
    .from(schema.posts)
    .innerJoin(schema.groups, eq(schema.posts.groupId, schema.groups.id))
    .where(eq(schema.posts.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row || row.status === 'deleted') {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-12 text-center">
        <h1 className="text-xl font-semibold">Removed by moderator</h1>
        <p className="mt-2 text-[var(--pm-muted)]">This content is no longer available.</p>
      </div>
    );
  }

  permanentRedirect(`/g/${row.groupSlug}/${row.slug}`);
}
