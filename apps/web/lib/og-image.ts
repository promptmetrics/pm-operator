import 'server-only';

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; PromptMetricsBot/1.0; +https://promptmetrics.dev)',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cache.set(url, { url: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      cache.set(url, { url: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const buffer = await res.arrayBuffer();
    const truncated = buffer.slice(0, MAX_HTML_BYTES);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(truncated);
    const imageUrl = parseOgImage(html, res.url || url);

    cache.set(url, { url: imageUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return imageUrl;
  } catch {
    cache.set(url, { url: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
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
