import { createHash, timingSafeEqual } from 'crypto';

// PKCE (RFC 7636). Only S256 is accepted — `plain` is rejected so a stolen
// challenge can't be replayed without the verifier. The challenge is
// base64url(sha256(verifier)) with no padding; the comparison is timing-safe.

export function verifyCodeVerifier(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (method !== 'S256') return false;
  if (!verifier || !challenge) return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}