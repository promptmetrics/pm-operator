import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyMcpOAuthToken,
  REQUIRED_READ_SCOPE,
  TOKEN_ISSUER,
  TOKEN_AUDIENCE,
} from './auth';

const TEST_SECRET = 'test-secret-key-at-least-32-bytes-long-for-hs256';
const RESOURCE_METADATA_URL = 'https://operator.promptmetrics.dev/.well-known/oauth-protected-resource/api/mcp';

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function createToken(payload: Record<string, unknown>, secret: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payloadB64}`)
    .digest('base64url');
  return `${header}.${payloadB64}.${signature}`;
}

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/mcp', { headers });
}

// exp is now REQUIRED (2026-07-28 / OAuth 2.1) — every well-formed token
// carries a numeric exp one hour in the future unless a test overrides it.
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    sub: 'client-123',
    scope: REQUIRED_READ_SCOPE,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('verifyMcpOAuthToken', () => {
  beforeEach(() => {
    process.env.MCP_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.MCP_TOKEN_SECRET;
  });

  it('accepts a valid token with the required read scope', async () => {
    const token = createToken(validPayload(), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.clientId).toBe('client-123');
      expect(result.scopes).toContain(REQUIRED_READ_SCOPE);
      expect(result.token).toBe(token);
      expect(result.expiresAt).toBe(validPayload().exp);
    }
  });

  it('extracts the client id from the client_id claim when sub is absent', async () => {
    const token = createToken(
      validPayload({ sub: undefined, client_id: 'client-from-claim' }),
      TEST_SECRET
    );
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.clientId).toBe('client-from-claim');
    }
  });

  it('accepts scope as a space-separated string or an array', async () => {
    const stringToken = createToken(validPayload({ scope: 'community:read other:scope' }), TEST_SECRET);
    const arrayToken = createToken(validPayload({ scope: ['community:read', 'other:scope'] }), TEST_SECRET);

    const stringResult = await verifyMcpOAuthToken(makeRequest(stringToken));
    const arrayResult = await verifyMcpOAuthToken(makeRequest(arrayToken));

    expect(stringResult).not.toBeInstanceOf(Response);
    expect(arrayResult).not.toBeInstanceOf(Response);
    if (!(stringResult instanceof Response)) {
      expect(stringResult.scopes).toEqual(['community:read', 'other:scope']);
    }
    if (!(arrayResult instanceof Response)) {
      expect(arrayResult.scopes).toEqual(['community:read', 'other:scope']);
    }
  });

  it('carries the acting user_id onto the verified token', async () => {
    const token = createToken(validPayload({ user_id: 'user-abc-123' }), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.userId).toBe('user-abc-123');
    }
  });

  it('rejects a token without the required exp claim', async () => {
    const token = createToken(validPayload({ exp: undefined }), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const text = await result.text();
      expect(text).toContain('Token missing required exp claim');
    }
  });

  it('rejects a token with an invalid signature', async () => {
    const token = createToken(validPayload(), 'wrong-secret');
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const text = await result.text();
      expect(text).toContain('Invalid JWT signature');
    }
  });

  it('rejects a token missing the required read scope', async () => {
    const token = createToken(validPayload({ scope: 'other:scope' }), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
      const text = await result.text();
      expect(text).toContain(`Missing required scope ${REQUIRED_READ_SCOPE}`);
    }
  });

  it('rejects an expired token', async () => {
    const token = createToken(
      validPayload({ exp: Math.floor(Date.now() / 1000) - 60 }),
      TEST_SECRET
    );
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const text = await result.text();
      expect(text).toContain('Token expired');
    }
  });

  it('rejects a token when the signing secret is missing (server misconfiguration → 500)', async () => {
    delete process.env.MCP_TOKEN_SECRET;
    const token = createToken(validPayload(), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(500);
      const text = await result.text();
      expect(text).toContain('MCP_TOKEN_SECRET not configured');
    }
  });

  it('rejects a token with an invalid issuer', async () => {
    const token = createToken(validPayload({ iss: 'wrong-issuer' }), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const text = await result.text();
      expect(text).toContain('Invalid token issuer');
    }
  });

  it('rejects a token with an invalid audience', async () => {
    const token = createToken(validPayload({ aud: 'wrong-audience' }), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const text = await result.text();
      expect(text).toContain('Invalid token audience');
    }
  });

  it('validates the client when a lookup function is provided', async () => {
    const token = createToken(validPayload(), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token), {
      lookupClient: async () => ({ clientId: 'client-123', scopes: [REQUIRED_READ_SCOPE], isActive: true }),
    });
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.clientId).toBe('client-123');
      expect(result.scopes).toContain(REQUIRED_READ_SCOPE);
    }
  });

  it('intersects token scopes with the client allowed scopes', async () => {
    const token = createToken(validPayload({ scope: ['community:read', 'community:write'] }), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token), {
      lookupClient: async () => ({ clientId: 'client-123', scopes: [REQUIRED_READ_SCOPE], isActive: true }),
    });
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      // community:write is dropped — not in the client's allowed scopes.
      expect(result.scopes).toEqual([REQUIRED_READ_SCOPE]);
    }
  });

  it('rejects a token for an inactive client when lookup is provided (→ 401 invalid_token)', async () => {
    const token = createToken(validPayload(), TEST_SECRET);
    const result = await verifyMcpOAuthToken(makeRequest(token), {
      lookupClient: async () => ({ clientId: 'client-123', scopes: [REQUIRED_READ_SCOPE], isActive: false }),
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const text = await result.text();
      expect(text).toContain('Client not registered or inactive');
    }
  });

  it('advertises the RFC 9728 resource_metadata URL in the 401 WWW-Authenticate challenge', async () => {
    // No Authorization header → invalid_token 401 with a WWW-Authenticate challenge.
    const result = await verifyMcpOAuthToken(makeRequest(), {
      resourceMetadataUrl: RESOURCE_METADATA_URL,
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      const challenge = result.headers.get('WWW-Authenticate') ?? '';
      expect(challenge).toContain('Bearer');
      expect(challenge).toContain(`resource_metadata="${RESOURCE_METADATA_URL}"`);
    }
  });
});