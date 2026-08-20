import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';

// Monorepo root, derived from this file's location so the value is correct
// on any machine (a hardcoded absolute path broke CI runners).
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Security headers (audit item 11), adapted from the www repo's pattern.
// CSP is ENFORCED, not Report-Only: nobody watches a report endpoint, and the
// binary wins here are frame-ancestors/object-src/base-uri. The policy is
// deliberately permissive where the app needs it ('unsafe-inline'/'unsafe-eval'
// for Next + PostHog, img-src https: for avatars and link-preview thumbnails).
//
// Verified before shipping:
//   - OAuth consent (app/oauth/*) is top-level navigation, no iframes or
//     postMessage, and the consent form posts same-origin → frame-ancestors
//     'self' + form-action 'self' are safe.
//   - sanitize-html strips iframes from post bodies → frame-src 'self' loses
//     nothing (revisit if YouTube embeds are ever allowed through).
//   - CSP host wildcards span labels, so https://*.sentry.io covers regional
//     ingest hosts (oXXX.ingest.de.sentry.io) too.
//   - Referrer-Policy is strict-origin-when-cross-origin, NOT www's
//     no-referrer: members share outbound links, and the origin referrer is
//     the referral credit this community generates.
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://eu-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP_HEADER },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: [
    '@pm-operator/ui',
    '@pm-operator/api',
    '@pm-operator/db',
    '@pm-operator/mcp',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // IndexNow key-ownership file (audit item 13): /{key}.txt must return the
  // key. The key lives only in env, so the rewrite is registered only when
  // it's set; the dotted path bypasses middleware (matcher excludes dots).
  async rewrites() {
    const indexNowKey = process.env.INDEXNOW_KEY;
    return indexNowKey
      ? [{ source: `/${indexNowKey}.txt`, destination: '/api/indexnow-key' }]
      : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Keep upload logs quiet outside of production builds.
  silent: process.env.VERCEL_ENV !== 'production',
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
