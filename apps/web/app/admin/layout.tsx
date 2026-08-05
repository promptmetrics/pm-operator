import * as React from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { AdminNav } from './components/AdminNav';
import { AdminSidebar } from './components/AdminSidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await getSession();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const db = createServiceDb();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    columns: { role: true },
  });

  if (user?.role !== 'admin') {
    redirect('/feed');
  }

  return (
    <div className="flex min-h-screen flex-row">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <AdminNav />
        <main className="flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
