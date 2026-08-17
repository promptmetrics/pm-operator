import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { requireMcpEnabled, CORS_HEADERS } from '@/lib/oauth/constants';
import { sha256Hex } from '@/lib/oauth/codes';
import { lookupClientByClientId } from '@/lib/oauth/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createServiceDb();

// RFC 7009 Token Revocation. Only refresh tokens are stateful and revocable —
// access tokens are stateless HS256 JWTs, so revoking one is a no-op that relies
// on the 1h TTL (the jti claim is already emitted for a future denylist).
// A public PKCE client proves ownership by sending a client_id that matches the
// token's client. Per RFC 7009 the response is always 200 (never leak whether a
// token existed), even on unknown/mismatched tokens.
export async function POST(req: Request) {
  const disabled = requireMcpEnabled();
  if (disabled) return disabled;

  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  const clientIdText = String(form.get('client_id') ?? '');

  if (!token) {
    return new NextResponse(null, { status: 200, headers: { ...CORS_HEADERS } });
  }

  // Treat the token as a refresh token (the only revocable kind here).
  const rows = await db
    .select()
    .from(schema.oauthRefreshTokens)
    .where(eq(schema.oauthRefreshTokens.tokenHash, sha256Hex(token)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return new NextResponse(null, { status: 200, headers: { ...CORS_HEADERS } });
  }

  // Verify the caller owns the token: for a public client, the posted client_id
  // must resolve to the token's client. A mismatch is still 200 (no leak).
  if (clientIdText) {
    const client = await lookupClientByClientId(db, clientIdText);
    if (!client || client.id !== row.clientId) {
      return new NextResponse(null, { status: 200, headers: { ...CORS_HEADERS } });
    }
  }

  // Mark this token used and revoke the rest of the chain for this client+user.
  await db
    .update(schema.oauthRefreshTokens)
    .set({ used: true })
    .where(
      and(
        eq(schema.oauthRefreshTokens.clientId, row.clientId),
        eq(schema.oauthRefreshTokens.userId, row.userId),
        eq(schema.oauthRefreshTokens.used, false),
      ),
    );

  return new NextResponse(null, { status: 200, headers: { ...CORS_HEADERS } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}