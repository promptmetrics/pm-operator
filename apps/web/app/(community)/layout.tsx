import * as React from 'react';
import { Header } from './components/Header';
import { RealtimeProvider } from './components/RealtimeProvider';

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-4 py-6">{children}</main>
      </div>
    </RealtimeProvider>
  );
}
