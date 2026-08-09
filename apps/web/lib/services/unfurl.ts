import type { LinkPreview } from '@pm-operator/api';
import { safeFetch, readBodyCapped } from './safe-fetch';

// Track 2A link unfurling. Fetches the first URL in a post/comment body and
// builds a {url, domain, title, desc} card server-side. Zero DB queries.
// Any failure returns null — a preview must never block a save.
//
// The SSRF guard and the redirect loop live in safe-fetch.ts so og-image.ts
// shares one implementation. Node runtime only (safe-fetch uses node:dns).
// Route files that reach this module must export `runtime = 'nodejs'`.

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 512 * 1024;

/** Re-exported for callers that only need the address range check. */
export { isBlockedAddress } from './safe-fetch';

// Clamp lengths to linkPreviewSchema in @pm-operator/api.
const URL_MAX = 2048;
const DOMAIN_MAX = 255;
const TITLE_MAX = 200;
const DESC_MAX = 300;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanText(raw: string, max: number): string {
  // Strip raw tags, decode entities, then strip tags that the decode
  // uncovered (&lt;b&gt; inside a content attribute).
  return decodeEntities(raw.replace(/<[^>]*>/g, ' '))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function metaContent(html: string, matcher: RegExp): string | null {
  // <meta ... property="og:title" ... content="..."> in either attribute order.
  const tagRe = /<meta\b[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html)) !== null) {
    if (!matcher.test(tag[0])) continue;
    const content = tag[0].match(/\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i);
    const value = content?.[2] ?? content?.[3];
    if (value) return value;
  }
  return null;
}

export function parseHtmlPreview(html: string): { title: string | null; desc: string | null } {
  const ogTitle = metaContent(html, /\b(?:property|name)\s*=\s*["']og:title["']/i);
  const docTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const ogDesc = metaContent(html, /\b(?:property|name)\s*=\s*["']og:description["']/i);
  const metaDesc = metaContent(html, /\bname\s*=\s*["']description["']/i);

  const title = cleanText(ogTitle ?? docTitle ?? '', TITLE_MAX) || null;
  const desc = cleanText(ogDesc ?? metaDesc ?? '', DESC_MAX) || null;
  return { title, desc };
}

/**
 * Fetch `url` and build a link preview card. Returns null on ANY failure
 * (bad scheme/port, private/loopback target, redirect into a private range,
 * timeout, non-HTML, no title). Never throws.
 */
export async function unfurlUrl(url: string): Promise<LinkPreview | null> {
  if (url.length > URL_MAX) return null;

  try {
    const result = await safeFetch(url, {
      timeoutMs: TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      headers: {
        'user-agent': 'pm-operator-unfurl/1.0 (+https://operator.promptmetrics.dev)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!result) return null;

    const { response, finalUrl: current } = result;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }

    const html = await readBodyCapped(response, MAX_BODY_BYTES);
    const { title, desc } = parseHtmlPreview(html);
    if (!title) return null;

    const finalUrl = current.toString();
    if (finalUrl.length > URL_MAX) return null;

    return {
      url: finalUrl,
      domain: current.hostname.slice(0, DOMAIN_MAX),
      title,
      desc,
    };
  } catch {
    return null;
  }
}

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/i;
const BARE_URL_RE = /https?:\/\/[^\s<>"'\])]+/i;

/** First URL in a body: prefer the first <a href> in the HTML, then the first bare URL in the plain text. */
export function extractFirstUrl(html: string, plainText?: string): string | null {
  const href = html.match(HREF_RE)?.[1];
  if (href) return href;
  return html.match(BARE_URL_RE)?.[0] ?? plainText?.match(BARE_URL_RE)?.[0] ?? null;
}

/**
 * Write-path helper for the post/comment create services: extract the first
 * URL and unfurl it. Null when there is no URL or the unfurl fails — a
 * preview must never block the save.
 */
export async function buildLinkPreview(
  html: string,
  plainText?: string
): Promise<LinkPreview | null> {
  try {
    const url = extractFirstUrl(html, plainText);
    if (!url) return null;
    return await unfurlUrl(url);
  } catch {
    return null;
  }
}
