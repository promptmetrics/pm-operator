import type { MetadataRoute } from 'next';
import { getPublicSiteUrl } from '@/lib/site-url';

// Note: Cloudflare prepends its own managed block (AI-crawler Disallow rules and
// a Content-Signal line) ahead of what this route returns, so the live
// robots.txt is these rules plus that block. Changing the AI-crawler policy is a
// Cloudflare dashboard change, not an edit here.
const SITE_URL = getPublicSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // Public content surface: public circles, their posts, author profiles,
        // and the feed. /g/* covers both /g/{group} and /g/{group}/{post};
        // /api/img/ is the post-image proxy — Google Images can only index
        // heroes if it may fetch them, and the longest-match allow beats the
        // /api/ disallow. Everything auth-gated is disallowed below. robots.txt
        // is a hint, not enforcement — middleware + postVisibilityFilter remain
        // the real gate.
        //
        // /u/{slug} is deliberately crawlable (author pages are the E-E-A-T
        // surface post JSON-LD author.url points at); the follower graphs and
        // devcard sub-pages stay out as thin/duplicate content.
        //
        // /login is NOT listed: it carries a noindex meta instead. A disallow
        // prevents crawling but not indexing, so an externally-linked /login
        // could still index as a bare URL — noindex requires the crawl.
        allow: ['/g/*', '/feed', '/api/img/'],
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
          '/u/*/followers',
          '/u/*/following',
          '/u/*/devcard',
          '/post/new',
          '/crash-test',
          '/invite/',
          '/digest',
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