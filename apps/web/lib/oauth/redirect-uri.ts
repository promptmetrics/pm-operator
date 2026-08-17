// redirect_uri validation (RFC 9700 + RFC 8252 loopback tolerance).
//
// Exact match against a registered URI first. For loopback redirects
// (http on localhost / 127.0.0.1 / ::1), any port matches a registered loopback
// URI with the same scheme + host + path + query — RFC 8252 §7.3 lets a native
// client listen on an ephemeral port. Non-loopback URIs must match exactly.
// Non-http(s) schemes (javascript:, file:, data:) are rejected unconditionally.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function parseOrNull(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

export function validateRedirectUri(requested: string, registered: string[]): boolean {
  const req = parseOrNull(requested);
  if (!req) return false;
  if (req.protocol !== 'http:' && req.protocol !== 'https:') return false;

  for (const reg of registered) {
    if (requested === reg) return true;
    const regUrl = parseOrNull(reg);
    if (!regUrl) continue;
    if (isLoopback(req) && isLoopback(regUrl)) {
      if (
        req.protocol === regUrl.protocol &&
        req.hostname === regUrl.hostname &&
        req.pathname === regUrl.pathname &&
        req.search === regUrl.search
      ) {
        return true;
      }
    }
  }
  return false;
}

// Used by DCR to validate each redirect_uri a client registers. Loopback http
// is allowed (native clients); everything else must be https.
export function isValidRegistrationRedirectUri(uri: string): boolean {
  const url = parseOrNull(uri);
  if (!url) return false;
  if (url.protocol === 'http:' && isLoopback(url)) return true;
  return url.protocol === 'https:';
}