'use client';

import { RouteErrorFallback } from '@/components/RouteErrorFallback';

/**
 * Root segment boundary. Catches anything not already contained by a deeper
 * boundary: /login, /register, /forgot-password, /auth/*, and — critically —
 * a throw inside the (community) or admin *layouts* themselves, which their
 * own error.tsx cannot catch.
 *
 * Renders inside app/layout.tsx, so the document, fonts, and tokens survive.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16">
      <RouteErrorFallback error={error} reset={reset} scope="root" />
    </div>
  );
}
