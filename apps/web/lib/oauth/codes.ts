import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Raw secret values (auth codes, refresh tokens) are generated with
// crypto.randomBytes and returned to the client exactly once. Only their
// SHA-256 hash is persisted (code_hash / token_hash), so a DB leak yields no
// usable credentials. Lookups are by hash; the raw value never touches the DB.

export interface SecretValue {
  /** base64url random bytes; returned to the client once, never persisted. */
  raw: string;
  /** sha256 hex; stored + looked up. */
  hash: string;
}

export function randomSecret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createAuthorizationCode(): SecretValue {
  const raw = randomSecret(32);
  return { raw, hash: sha256Hex(raw) };
}

export function createRefreshToken(): SecretValue {
  const raw = randomSecret(48);
  return { raw, hash: sha256Hex(raw) };
}

// Confidential-client (client_secret_post) authentication. The DCR endpoint
// stores only sha256Hex(client_secret) — the raw secret is returned to the
// registrant exactly once (RFC 7591 §3.2.1) and never persisted. The token and
// revoke endpoints re-hash the presented secret and compare it timing-safe.
// Returns false for a null/empty stored hash (public 'none' clients have no
// secret); callers gate on tokenEndpointAuthMethod before calling this.
export function verifyClientSecret(received: string, storedHash: string | null): boolean {
  if (!received || !storedHash) return false;
  const a = Buffer.from(sha256Hex(received));
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Consent CSRF nonce. Binds the /oauth/approve POST to the /oauth/authorize
// page that rendered it: the same nonce is placed in a hidden form field AND an
// HttpOnly SameSite=Lax cookie, so a cross-site POST lacking the cookie is
// rejected. `payload` is the canonical OAuth-param string signed at render time
// and re-checked on submit (so the client/redirect/scope can't be swapped).
// Reuses MCP_TOKEN_SECRET as the HMAC key — it is already the AS's symmetric key.
export function createConsentNonce(payload: string, secret: string, issuedMs: number): string {
  const mac = createHmac('sha256', secret).update(`${payload}.${issuedMs}`).digest('hex');
  return `${issuedMs}.${mac}`;
}

export function verifyConsentNonce(
  payload: string,
  nonce: string,
  secret: string,
  ttlMs: number,
  nowMs = Date.now(),
): boolean {
  const dot = nonce.indexOf('.');
  if (dot <= 0) return false;
  const issuedMs = Number(nonce.slice(0, dot));
  const mac = nonce.slice(dot + 1);
  if (!Number.isFinite(issuedMs)) return false;
  const age = nowMs - issuedMs;
  if (age < 0 || age > ttlMs) return false;
  const expected = createHmac('sha256', secret).update(`${payload}.${issuedMs}`).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Canonical string signed by the consent nonce — every field the approve route
// re-validates, in a fixed order, so swapping any of them invalidates the mac.
export function consentPayload(fields: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}): string {
  return [fields.clientId, fields.redirectUri, fields.scope, fields.state, fields.codeChallenge].join('|');
}