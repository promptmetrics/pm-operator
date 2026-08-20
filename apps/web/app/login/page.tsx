import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

// noindex-over-disallow (audit item 7.4): robots.ts no longer disallows
// /login, because a disallow blocks the crawl but not the indexing — an
// externally-linked login URL could still index as a bare URL. Letting Google
// crawl the page and see noindex is the only directive that actually removes
// it. `follow` keeps any outbound link equity flowing.
export const metadata: Metadata = {
  title: 'Sign in — Operator Stack community',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen flex-col items-center justify-center px-4 py-12" />}>
      <LoginForm />
    </Suspense>
  );
}
