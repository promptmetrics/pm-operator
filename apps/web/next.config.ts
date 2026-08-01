import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Monorepo root, derived from this file's location so the value is correct
// on any machine (a hardcoded absolute path broke CI runners).
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig = {
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

export default nextConfig;
