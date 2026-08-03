import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';

// Monorepo root, derived from this file's location so the value is correct
// on any machine (a hardcoded absolute path broke CI runners).
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
