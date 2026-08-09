import 'server-only';
import { safeFetch, readBodyCapped } from './services/safe-fetch';

// Share images for post pages. Post pages are PUBLIC (see the note on
// COMMUNITY_ROUTE_REGEX in middleware.ts), so generateMetadata here runs for
// anonymous visitors and for link-preview crawlers — meaning a member-supplied
// URL reaches fetchOgImage on every uncached view by anyone.
//
// That is why the fetch goes through safeFetch. This module used to call
// `fetch(url, { redirect: 'follow' })` with no destination check at all, which
// let any member point the server at an internal address (169.254.169.254 and
// friends) simply by posting a link that redirects there.

interface CacheEntry {
  url: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 200 * 1024;

/**
 * Find the first external http(s) link in sanitized post HTML.
 */
export function firstExternalLink(html: string): string | null {
  const anchorRe = /<a\b[^>]*?href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  const match = anchorRe.exec(html);
  return match?.[1] ?? null;
}

function absoluteUrl(base: string, maybeRelative: string): string {
  if (!maybeRelative) return base;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return maybeRelative;
  }
}

function parseOgImage(html: string, baseUrl: string): string | null {
  // Match both property="og:image" and name="twitter:image".
  const metaRe = /<meta\b[^>]*?(?:property=["'](og:image|twitter:image)["'][^>]*?content=["']([^"']*)["']|content=["']([^"']*)["'][^>]*?property=["'](og:image|twitter:image)["'])[^>]*>/gi;
  const matches: { tag: string; url: string }[] = [];
  let m;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = (m[1] || m[4] || '').toLowerCase();
    const rawUrl = m[2] || m[3] || '';
    matches.push({ tag, url: absoluteUrl(baseUrl, rawUrl) });
  }
  if (matches.length === 0) return null;
  // Prefer og:image, fall back to twitter:image.
  const og = matches.find((x) => x.tag === 'og:image');
  return og?.url || matches[0].url;
}

/**
 * Best-effort fetch of the Open Graph image for a public URL.
 * Results are cached for a few minutes to avoid hammering third-party sites.
 */
export async function fetchOgImage(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const miss = () => {
    cache.set(url, { url: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  };

  try {
    // safeFetch re-checks the destination on every redirect hop and returns
    // null for blocked schemes, ports, credentials, private/loopback targets,
    // timeouts, and network errors.
    const result = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; PromptMetricsBot/1.0; +https://promptmetrics.dev)',
      },
    });
    if (!result) return miss();

    const { response: res, finalUrl } = result;

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return miss();
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      await res.body?.cancel().catch(() => undefined);
      return miss();
    }

    const html = await readBodyCapped(res, MAX_HTML_BYTES);
    const imageUrl = parseOgImage(html, finalUrl.toString());

    cache.set(url, { url: imageUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return imageUrl;
  } catch {
    return miss();
  }
}

/**
 * Resolve the social-sharing image for a post: explicit cover image wins,
 * otherwise try to fetch the OG image of the first external link.
 */
export async function resolvePostShareImage(
  coverImageUrl: string | null | undefined,
  contentHtml: string
): Promise<string | null> {
  if (coverImageUrl) return coverImageUrl;
  const link = firstExternalLink(contentHtml);
  if (!link) return null;
  return fetchOgImage(link);
}
