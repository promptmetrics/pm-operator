import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { getUser } from '@/lib/auth/server';
import { createServiceDb } from '@/lib/db';
import { requireMcpEnabled } from '@/lib/oauth/constants';
import { validateRedirectUri } from '@/lib/oauth/redirect-uri';
import { lookupClientByClientId } from '@/lib/oauth/client';
import { narrowGrantedScopes, parseScope, SCOPE_DESCRIPTIONS } from '@/lib/oauth/scopes';
import { createConsentNonce, consentPayload } from '@/lib/oauth/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createServiceDb();

// OAuth 2.1 authorization endpoint. Validates the request, redirects to /login
// (carrying returnUrl) when there is no Supabase session, otherwise renders a
// consent screen with an HMAC nonce (signed over the OAuth params + an issued
// timestamp, using MCP_TOKEN_SECRET) placed in a hidden form field — no cookie
// round-trip, so the flow works in popup/embedded-webview contexts (e.g. the
// claude.ai cowork connector) where a SameSite cookie would not survive the
// POST. The "Allow" form POSTs to /oauth/approve, which verifies the nonce's
// HMAC + freshness and issues a single-use code. On invalid client_id or
// redirect_uri it renders an inline error page and never redirects to an
// unvalidated redirect_uri (no open redirect).
export async function GET(req: Request) {
  const disabled = requireMcpEnabled();
  if (disabled) return disabled;

  const url = new URL(req.url);
  const p = url.searchParams;
  const clientId = p.get('client_id') ?? '';
  const redirectUri = p.get('redirect_uri') ?? '';
  const state = p.get('state') ?? '';
  const codeChallenge = p.get('code_challenge') ?? '';
  const codeChallengeMethod = p.get('code_challenge_method') ?? '';
  const responseType = p.get('response_type') ?? '';
  const requestedScope = p.get('scope') ?? '';

  // PKCE is mandatory (S256 only). A request without a valid challenge is
  // rejected before any client lookup.
  if (responseType !== 'code') {
    return errorPage('Unsupported response_type', 'Only response_type=code is supported.');
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return errorPage('PKCE required', 'This server requires code_challenge_method=S256.');
  }

  const client = await lookupClientByClientId(db, clientId);
  if (!client || !client.isActive) {
    return errorPage('Unknown client', `No active client is registered for client_id "${escapeHtml(clientId)}".`);
  }

  if (!validateRedirectUri(redirectUri, client.redirectUris ?? [])) {
    return errorPage('Invalid redirect_uri', 'The redirect_uri does not match any URI registered for this client.');
  }

  const { user } = await getUser();
  if (!user) {
    // No session → send the user through Google sign-in, then back here.
    const loginUrl = new URL('/login', url.origin);
    loginUrl.searchParams.set('returnUrl', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Load the DB row to read the role (admin gate) and the display name.
  const userRows = await db
    .select({ role: schema.users.role, username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  const userRow = userRows[0];
  if (!userRow) {
    return errorPage('Account not found', 'Your sign-in is valid but no community account exists yet.');
  }

  const isAdmin = userRow.role === 'admin';
  const grantedScopes = narrowGrantedScopes(parseScope(requestedScope), client.scopes, isAdmin);
  const grantedScopeStr = grantedScopes.join(' ');

  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret) {
    return new NextResponse('Server misconfigured: MCP_TOKEN_SECRET not set', { status: 500 });
  }

  const payload = consentPayload({
    clientId,
    redirectUri,
    scope: grantedScopeStr,
    state,
    codeChallenge,
  });
  const issuedMs = Date.now();
  const nonce = createConsentNonce(payload, secret, issuedMs);

  return new NextResponse(
    renderConsent({
      clientName: client.name,
      redirectUri,
      scopes: grantedScopes,
      nonce,
      state,
      clientId,
      grantedScopeStr,
      codeChallenge,
      username: userRow.username,
    }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function renderConsent(args: {
  clientName: string;
  redirectUri: string;
  scopes: string[];
  nonce: string;
  state: string;
  clientId: string;
  grantedScopeStr: string;
  codeChallenge: string;
  username: string | null;
}): string {
  const { clientName, redirectUri, scopes, nonce, state, clientId, grantedScopeStr, codeChallenge, username } = args;
  const scopeRows = scopes
    .map(
      (s) =>
        `<li><span class="scope-code">${escapeHtml(s)}</span><span class="scope-desc">${escapeHtml(SCOPE_DESCRIPTIONS[s] ?? s)}</span></li>`,
    )
    .join('');
  const greeting = username ? `<p class="muted">Signed in as ${escapeHtml(username)}</p>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize ${escapeHtml(clientName)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f6f7f9; color: #111; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 1.5rem; }
  .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 16px; max-width: 460px; width: 100%; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  .muted { color: #5b6470; font-size: .9rem; margin: .25rem 0 0; }
  .client { font-weight: 600; }
  .redirect { font-size: .8rem; color: #6b7280; word-break: break-all; margin: .25rem 0 1.25rem; }
  ul { list-style: none; padding: 0; margin: 0 0 1.5rem; display: grid; gap: .6rem; }
  li { display: grid; grid-template-columns: auto 1fr; gap: .75rem; align-items: baseline; }
  .scope-code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .8rem; background: #eef1f5; padding: .15rem .4rem; border-radius: 6px; white-space: nowrap; }
  .scope-desc { font-size: .9rem; }
  .actions { display: flex; gap: .75rem; justify-content: flex-end; }
  button { background: #111; color: #fff; border: none; border-radius: 10px; padding: .6rem 1.1rem; font-size: .95rem; cursor: pointer; }
  button:hover { background: #000; }
  a.cancel { color: #5b6470; text-decoration: none; padding: .6rem .5rem; font-size: .95rem; }
  a.cancel:hover { color: #111; }
  @media (prefers-color-scheme: dark) { body { background: #0b0c0e; color: #e8eaed; } .card { background: #15171a; border-color: #23262b; } .scope-code { background: #23262b; } .muted, .redirect { color: #9aa1ad; } button { background: #e8eaed; color: #111; } button:hover { background: #fff; } a.cancel { color: #9aa1ad; } a.cancel:hover { color: #e8eaed; } }
</style>
</head>
<body>
  <main class="card">
    <h1>Authorize <span class="client">${escapeHtml(clientName)}</span></h1>
    ${greeting}
    <p class="muted">This app is requesting access to your Operator community account:</p>
    <ul>${scopeRows}</ul>
    <p class="redirect">It will redirect to <code>${escapeHtml(redirectUri)}</code> after you approve.</p>
    <form method="POST" action="/oauth/approve">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="scope" value="${escapeHtml(grantedScopeStr)}" />
      <input type="hidden" name="state" value="${escapeHtml(state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="S256" />
      <input type="hidden" name="nonce" value="${escapeHtml(nonce)}" />
      <div class="actions">
        <a class="cancel" href="/">Cancel</a>
        <button type="submit">Allow</button>
      </div>
    </form>
  </main>
</body>
</html>`;
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