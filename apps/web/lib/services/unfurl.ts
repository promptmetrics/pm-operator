import { lookup } from 'node:dns/promises';
import type { LinkPreview } from '@pm-operator/api';

// Track 2A link unfurling. Fetches the first URL in a post/comment body and
// builds a {url, domain, title, desc} card server-side. Zero DB queries.
// Any failure returns null — a preview must never block a save.
//
// Node runtime only (uses node:dns). Route files that reach this module must
// export `runtime = 'nodejs'`.

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 3_000;
const MAX_BODY_BYTES = 512 * 1024;

// Clamp lengths to linkPreviewSchema in @pm-operator/api.
const URL_MAX = 2048;
const DOMAIN_MAX = 255;
const TITLE_MAX = 200;
const DESC_MAX = 300;

function isPrivateIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    // Not a well-formed dotted quad; treat as unsafe rather than guessing.
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // IPv4-mapped/compatible addresses (::ffff:10.0.0.1) — check the v4 part.
  const v4Match = normalized.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) return isPrivateIPv4(v4Match[1]);
  // The WHATWG URL parser normalizes mapped literals to hex form
  // ([::ffff:10.0.0.1] becomes [::ffff:a00:1]) — convert back and check.
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  if (normalized === '::' || normalized === '::1') return true; // unspecified / loopback
  const firstGroup = normalized.split(':').find((part) => part.length > 0);
  if (!firstGroup) return true;
  const value = parseInt(firstGroup, 16);
  if (Number.isNaN(value)) return true;
  if ((value & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((value & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

export function isBlockedAddress(address: string, family: number): boolean {
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

function literalIpFamily(hostname: string): number | null {
  // URL() brackets IPv6 literals: [::1]
  if (hostname.startsWith('[') && hostname.endsWith(']')) return 6;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return 4;
  if (hostname.includes(':')) return 6;
  return null;
}

/**
 * SSRF guard for one URL (re-run on every redirect hop). Check order:
 * 1. protocol must be http:/https: — 2. no embedded credentials —
 * 3. port must be 80/443 (or the scheme default) — 4. literal-IP hosts are
 * range-checked directly — 5. otherwise dns.lookup(all) and EVERY resolved
 * address must be outside the blocked ranges.
 */
async function assertSafeUrl(parsed: URL): Promise<boolean> {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;

  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80;
  if (port !== 80 && port !== 443) return false;

  const hostname = parsed.hostname;
  const literalFamily = literalIpFamily(hostname);
  if (literalFamily !== null) {
    const bare = hostname.replace(/^\[|\]$/g, '');
    return !isBlockedAddress(bare, literalFamily);
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  return addresses.every((entry) => !isBlockedAddress(entry.address, entry.family));
}

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

async function readBodyCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
    }
  }
  if (received >= MAX_BODY_BYTES) {
    // Cap reached: stop pulling bytes and parse what we have. Titles and
    // meta tags live in <head>, well inside the first 512 KB.
    await reader.cancel().catch(() => undefined);
  }
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  for (const chunk of chunks) html += decoder.decode(chunk, { stream: true });
  html += decoder.decode();
  return html.length > MAX_BODY_BYTES ? html.slice(0, MAX_BODY_BYTES) : html;
}

/**
 * Fetch `url` and build a link preview card. Returns null on ANY failure
 * (bad scheme/port, private/loopback target, redirect into a private range,
 * timeout, non-HTML, no title). Never throws.
 */
export async function unfurlUrl(url: string): Promise<LinkPreview | null> {
  if (url.length > URL_MAX) return null;

  const controller = new AbortController();
  // One 3s budget for the whole chain, redirects included.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      return null;
    }

    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await assertSafeUrl(current))) return null;

      const res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'pm-operator-unfurl/1.0 (+https://operator.promptmetrics.dev)',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!location || hop === MAX_REDIRECTS) return null;
        try {
          current = new URL(location, current);
        } catch {
          return null;
        }
        continue;
      }

      response = res;
      break;
    }

    if (!response || !response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }

    const html = await readBodyCapped(response);
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
  } finally {
    clearTimeout(timer);
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
