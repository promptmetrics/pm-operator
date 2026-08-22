'use client';

// Product analytics via PostHog (T8.2). The `posthog` singleton is initialized
// client-side by <PostHogProvider> (apps/web/components/Analytics/PostHogProvider)
// using NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST. When those env vars
// are unset (e.g. PostHog not provisioned yet) the singleton stays a no-op stub,
// so every call below degrades cleanly without affecting the UI or sending data
// anywhere. Analytics must never block the UI — all calls are fire-and-forget
// and swallow errors.

import posthog from 'posthog-js';

export type AnalyticsEvent =
  | 'search_click'
  | 'signup'
  | 'onboarding_complete'
  | 'first_post'
  | 'first_comment'
  | 'daily_visit'
  | 'landing_cta_click';

export function trackEvent(
  event: AnalyticsEvent,
  payload: Record<string, unknown> = {},
): void {
  if (typeof window === 'undefined') return;
  try {
    posthog.capture(event, { ...payload, $current_url: window.location.href });
  } catch {
    // ignore
  }
}

/**
 * Associate subsequent events with a known user. Call after login resolves
 * (Header /api/v1/me) and on the onboarding form mount. With memory
 * persistence the anonymous distinct_id is per-session; identify merges this
 * session's events onto the person so cross-session funnels still resolve.
 */
export function identifyAnalytics(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  try {
    posthog.identify(userId, properties);
  } catch {
    // ignore
  }
}

/** Clear the analytics identity — call on sign out. */
export function analyticsReset(): void {
  if (typeof window === 'undefined') return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}