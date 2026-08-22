import * as React from 'react';
import type { Metadata } from 'next';
import { ToastProvider } from '@pm-operator/ui/components/Toast';
import { PostHogProvider } from '@/components/Analytics/PostHogProvider';
import { getPublicSiteUrl } from '@/lib/site-url';
import '@pm-operator/ui/styles/tokens.css';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Without metadataBase Next resolves relative OG/twitter image URLs against
  // localhost in dev and warns in prod. Same helper the canonicals and sitemap
  // use, so every absolute URL we publish shares one origin.
  metadataBase: new URL(getPublicSiteUrl()),
  title: 'Operator Stack',
  description:
    'A community for RevOps, CS, and marketing-ops operators sharing how they orchestrate their tools with coding agents.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="paper">
      <body className="pm-v3 bg-[var(--pm-paper)] text-[var(--pm-ink)] antialiased">
        {/* Fonts used to load via an @import at the top of globals.css — a
            serial render-blocking chain (app CSS → Google CSS → woff2). React
            hoists these into <head>; the preconnects overlap the DNS/TLS cost
            with the app CSS download. `precedence` is required for React to
            hoist and dedupe the stylesheet. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          precedence="default"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
        />
        <PostHogProvider>
          <ToastProvider>{children}</ToastProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
