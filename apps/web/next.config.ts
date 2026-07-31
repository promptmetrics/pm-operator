const nextConfig = {
  output: 'standalone',
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
