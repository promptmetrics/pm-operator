import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://promptmetrics.dev').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Public content surface only: public circles, their posts, and the feed.
        // /g/* covers both /g/{group} and /g/{group}/{post} (the public sub-paths);
        // everything auth-gated is disallowed below. robots.txt is a hint, not
        // enforcement — middleware + postVisibilityFilter remain the real gate.
        allow: ['/g/*', '/feed'],
        disallow: [
          '/admin/',
          '/api/',
          '/settings',
          '/search',
          '/leaderboards',
          '/notifications',
          '/messages',
          '/bookmarks',
          '/moderation',
          '/u/',
          '/post/new',
          '/crash-test',
          '/invite/',
          '/digest',
          '/login',
          '/register',
          '/forgot-password',
          '/auth/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}