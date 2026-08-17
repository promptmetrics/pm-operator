import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { getUser } from '@/lib/auth/server';
import { createServiceDb } from '@/lib/db';
import { requireMcpEnabled, CODE_TTL_S } from '@/lib/oauth/constants';
import { validateRedirectUri } from '@/lib/oauth/redirect-uri';
import { lookupClientByClientId } from '@/lib/oauth/client';
import { narrowGrantedScopes, parseScope } from '@/lib/oauth/scopes';
import { createAuthorizationCode, consentPayload, verifyConsentNonce } from '@/lib/oauth/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createServiceDb();
const NONCE_COOKIE = 'oauth_authorize_nonce';
const NONCE_TTL_MS = 300_000;

// Consent approval. The authorize page set an HMAC nonce in both a hidden form
// field and an HttpOnly SameSite=Lax cookie; a cross-site POST lacks the cookie
// and is rejected. The nonce HMAC binds the OAuth params, so swapping the
// client/redirect/scope invalidates it. On success a single-use auth code is
// stored by hash and the user is 303-redirected to the validated redirect_uri
// with ?code=&state=.
export async function POST(req: Request) {
  const disabled = requireMcpEnabled();
  if (disabled) return disabled;

  const form = await req.formData();
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const state = String(form.get('state') ?? '');
  const codeChallenge = String(form.get('code_challenge') ?? '');
  const codeChallengeMethod = String(form.get('code_challenge_method') ?? 'S256');
  const formScope = String(form.get('scope') ?? '');
  const formNonce = String(form.get('nonce') ?? '');

  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(NONCE_COOKIE)?.value ?? '';

  // Clear the nonce regardless of outcome (single-use).
  cookieStore.delete(NONCE_COOKIE);

  if (!formNonce || !cookieNonce || formNonce !== cookieNonce) {
    return errorPage('Consent verification failed', 'Your session may have expired. Please restart the authorization from your app.');
  }

  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    return new NextResponse('Server misconfigured: MCP_TOKEN_SECRET not set', { status: 500 });
  }

  const payload = consentPayload({ clientId, redirectUri, scope: formScope, state, codeChallenge });
  if (!verifyConsentNonce(payload, formNonce, secret, NONCE_TTL_MS)) {
    return errorPage('Consent verification failed', 'The authorization request could not be verified (nonce expired or tampered). Please restart.');
  }

  if (codeChallengeMethod !== 'S256' || !codeChallenge) {
    return errorPage('PKCE required', 'This server requires code_challenge_method=S256.');
  }

  const client = await lookupClientByClientId(db, clientId);
  if (!client || !client.isActive) {
    return errorPage('Unknown client', 'The client is no longer registered or active.');
  }
  if (!validateRedirectUri(redirectUri, client.redirectUris ?? [])) {
    return errorPage('Invalid redirect_uri', 'The redirect_uri does not match any URI registered for this client.');
  }

  const { user } = await getUser();
  if (!user) {
    // Session expired between authorize and approve — restart the flow.
    const authorizeUrl = new URL('/oauth/authorize', new URL(req.url).origin);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', formScope);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    const loginUrl = new URL('/login', new URL(req.url).origin);
    loginUrl.searchParams.set('returnUrl', authorizeUrl.toString());
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const userRows = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  if (!userRows[0]) {
    return errorPage('Account not found', 'Your sign-in is valid but no community account exists yet.');
  }

  const grantedScopes = narrowGrantedScopes(parseScope(formScope), client.scopes, userRows[0].role === 'admin');

  const code = createAuthorizationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_S * 1000);

  await db.insert(schema.oauthAuthorizationCodes).values({
    codeHash: code.hash,
    clientId: client.id,
    userId: user.id,
    scope: grantedScopes,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: 'S256',
    expiresAt,
    used: false,
  });

  const target = new URL(redirectUri);
  target.searchParams.set('code', code.raw);
  if (state) target.searchParams.set('state', state);
  return NextResponse.redirect(target, { status: 303 });
}

function errorPage(title: string, detail: string): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#f6f7f9;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:1.5rem}.card{background:#fff;border:1px solid #e3e6ea;border-radius:16px;max-width:460px;width:100%;padding:2rem}h1{font-size:1.1rem;margin:0 0 .5rem}p{color:#5b6470;margin:0}@media (prefers-color-scheme:dark){body{background:#0b0c0e;color:#e8eaed}.card{background:#15171a;border-color:#23262b}p{color:#9aa1ad}}</style>
</head><body><main class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></main></body></html>`;
  return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}