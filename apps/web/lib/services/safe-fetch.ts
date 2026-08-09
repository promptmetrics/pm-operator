import { lookup } from 'node:dns/promises';

// The single SSRF guard. Anything that fetches a URL a member supplied goes
// through safeFetch — link unfurling (unfurl.ts) and post share images
// (og-image.ts) both do. og-image.ts previously had its own unguarded
// `fetch(url, { redirect: 'follow' })`, which let any member point the server
// at an internal address; that is why this lives in one module now.
//
// Node runtime only (uses node:dns). Route and page files that reach this
// module must export `runtime = 'nodejs'`.

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 3_000;

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
export async function assertSafeUrl(parsed: URL): Promise<boolean> {
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

export interface SafeFetchResult {
  response: Response;
  /** The URL actually fetched after following redirects — every hop was checked. */
  finalUrl: URL;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  /** Budget for the WHOLE chain, redirects included. */
  timeoutMs?: number;
  maxRedirects?: number;
}

/**
 * Fetch a member-supplied URL with the SSRF guard applied to every hop.
 *
 * Redirects are followed manually (`redirect: 'manual'`) rather than by the
 * platform, because `redirect: 'follow'` connects to a redirect target without
 * giving us a chance to check it — a public URL that 302s to 169.254.169.254
 * is the whole attack.
 *
 * Returns null instead of throwing on ANY failure: blocked scheme, port,
 * credentials, private/loopback target, a redirect into a private range, too
 * many hops, a timeout, or a network error. Callers treat null as "no data".
 * The caller owns the returned response body and must consume or cancel it.
 */
export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult | null> {
  const {
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current: URL;
    try {
      current = url instanceof URL ? url : new URL(url);
    } catch {
      return null;
    }

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!(await assertSafeUrl(current))) return null;

      const res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel().catch(() => undefined);
        if (!location || hop === maxRedirects) return null;
        try {
          current = new URL(location, current);
        } catch {
          return null;
        }
        continue;
      }

      return { response: res, finalUrl: current };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a response body, stopping at `maxBytes`. Prevents a hostile or merely
 * enormous page from being pulled into memory in full.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
    }
  }
  if (received >= maxBytes) {
    // Cap reached: stop pulling bytes and parse what we have. Titles and
    // meta tags live in <head>, well inside the cap.
    await reader.cancel().catch(() => undefined);
  }
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  for (const chunk of chunks) html += decoder.decode(chunk, { stream: true });
  html += decoder.decode();
  return html.length > maxBytes ? html.slice(0, maxBytes) : html;
}
