import * as React from 'react';
import type { Metadata } from 'next';
import { ToastProvider } from '@pm-operator/ui/components/Toast';
import '@pm-operator/ui/styles/tokens.css';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'operator.promptmetrics.dev',
  description: 'A community for AI operators, founders, and teams building with AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="paper">
      <body className="pm-v3 bg-[var(--pm-paper)] text-[var(--pm-ink)] antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
