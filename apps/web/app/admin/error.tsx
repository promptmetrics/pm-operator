'use client';

import { RouteErrorFallback } from '@/components/RouteErrorFallback';

/**
 * Boundary for the admin segment. Nested inside admin/layout.tsx, so the admin
 * sidebar and nav stay usable and the admin can move to another panel instead
 * of being dropped back into the member-facing app.
 *
 * The secondary action therefore points at the admin dashboard, not /feed.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-10">
      <RouteErrorFallback
        error={error}
        reset={reset}
        scope="admin"
        secondaryHref="/admin"
        secondaryLabel="Go to admin dashboard"
      />
    </div>
  );
}
