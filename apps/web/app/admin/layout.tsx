import * as React from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { HeaderWithCommandPalette } from '../(community)/components/Header';
import { RealtimeProvider } from '../(community)/components/RealtimeProvider';
import { RailProvider } from '../(community)/components/RailProvider';
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
    // Header's providers mirror (community)/layout.tsx: RailProvider feeds the
    // header's rail toggle; RealtimeProvider feeds NotificationBell.
    <RealtimeProvider>
      <RailProvider>
        <div className="flex min-h-screen flex-col">
          <HeaderWithCommandPalette />
          {/* Below 860px the rail reflows into a chip row above the content. */}
          <div className="flex flex-1 flex-col min-[860px]:flex-row">
            <AdminSidebar />
            <main className="min-w-0 flex-1 px-4 py-6">{children}</main>
          </div>
        </div>
      </RailProvider>
    </RealtimeProvider>
  );
}
