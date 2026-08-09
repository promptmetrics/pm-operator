'use client';

import { RouteErrorFallback } from '@/components/RouteErrorFallback';

/**
 * Boundary for the whole (community) group — feed, circles, posts, profiles,
 * messages, notifications, search, settings, moderation.
 *
 * It is nested INSIDE (community)/layout.tsx, so a crash in any of those pages
 * leaves the header, the left rail, and the realtime provider mounted: the
 * failure is contained to the main column instead of blanking the document the
 * way the /notifications crash did.
 */
export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-10">
      <RouteErrorFallback error={error} reset={reset} scope="community" />
    </div>
  );
}
