'use client';

export type AnalyticsEvent =
  | 'search_click'
  | 'signup'
  | 'onboarding_complete'
  | 'first_post'
  | 'first_comment'
  | 'daily_visit';

const ANALYTICS_ENDPOINT = '/api/v1/analytics/events';

export function trackEvent(
  event: AnalyticsEvent,
  payload: Record<string, unknown> = {}
): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    event,
    payload,
    url: window.location.href,
    ts: Date.now(),
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ANALYTICS_ENDPOINT, body);
    } else {
      fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        body,
        keepalive: true,
        headers: { 'content-type': 'application/json' },
      }).catch(() => {
        // Silently ignore: analytics must never block the UI.
      });
    }
  } catch {
    // ignore
  }
}
