'use client';

// Initializes the PostHog (posthog-js) singleton for product analytics (T8.2).
// Rendered once near the root in apps/web/app/layout.tsx. Init runs at client
// module load (guarded by `typeof window`) so it precedes any child effect that
// calls trackEvent/identifyAnalytics.
//
// Privacy / GDPR: the product is EU-hosted (fra1), so we run cookieless —
// `persistence: 'memory'` sets no cookies and writes no localStorage, meaning
// no ePrivacy consent banner is required. The anonymous distinct_id lives only
// for the browser session; identify() merges sessions onto a person for funnels.
// `respect_dnt` honors Do-Not-Track, `autocapture: false` sends no raw DOM
// captures (we fire explicit events only), and `person_profiles: 'identified_only'`
// creates no person records until a user identifies.

import * as React from 'react';
import posthog from 'posthog-js';

// NEXT_PUBLIC_POSTHOG_KEY must be the PostHog *Project API key* (prefix `phc_`),
// which is public and is what posthog-js needs for client-side event capture.
// Do NOT use a *Personal API key* (`phx_`) here: it is private/server-only, a
// phx_ token is not a valid capture token so PostHog silently drops every event,
// and — because NEXT_PUBLIC_* values are inlined into the client bundle — a
// phx_ key here would leak a private credential to every site visitor.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// NEXT_PUBLIC_POSTHOG_HOST is the PostHog instance URL. The default is PostHog
// Cloud EU; set it only for US cloud (https://us.i.posthog.com) or a self-hosted
// instance.
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

if (typeof window !== 'undefined' && POSTHOG_KEY && !(posthog as any).__pm_init) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    persistence: 'memory',
    respect_dnt: true,
    autocapture: false,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    // No surveys in use; without this flag posthog-js lazily pulls the
    // surveys bundle from eu-assets on every pageview (~80% unused per PSI).
    disable_surveys: true,
  });
  (posthog as any).__pm_init = true;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}