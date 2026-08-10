import { describe, it, expect } from 'vitest';
import { createCommunityMcpServer, createMcpHandler } from './server';
import type { McpResourceServices } from './resources';
import type { McpToolServices } from './tools';

const noop = { debug() {}, info() {}, warn() {}, error() {} };

// All four resource services return a distinctive marker object so we can
// assert the handler JSON-stringified the right service's return into the
// resource text. Tool services are stubbed (resources don't call them).
function makeServices(overrides: Partial<McpResourceServices> = {}): McpResourceServices & McpToolServices {
  return {
    getUserProfileBySlug: async (slug: string) => ({ kind: 'user', slug }),
    getGroupBySlug: async (slug: string) => ({ kind: 'group', slug }),
    getPostById: async (id: string) => ({ kind: 'post', id }),
    getLeaderboard: async (type: string) => ({ kind: 'leaderboard', type }),
    // tool stubs (unused by resource handlers)
    searchPosts: async () => ({}),
    getUserProfile: async () => ({}),
    listLeaderboards: async () => ({}),
    summarizeThread: async () => ({}),
    ...overrides,
  } as McpResourceServices & McpToolServices;
}

const ENV = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

function makeHandler(services: McpResourceServices & McpToolServices) {
  return createMcpHandler(() => createCommunityMcpServer({ services, logger: noop }));
}

function read(handler: ReturnType<typeof makeHandler>, uri: string) {
  // 2026-07-28 mirrors params.uri into the Mcp-Name header for resources/read,
  // just as it mirrors the tool name for tools/call.
  return rpc(handler, 'resources/read', { uri }, { 'mcp-name': uri });
}

async function rpc(
  handler: ReturnType<typeof makeHandler>,
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  const body = { jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: ENV } };
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const res = await handler.fetch(req, {
    authInfo: { token: 't', clientId: 'c', scopes: ['community:read'] },
  });
  return { status: res.status, json: await res.json() };
}

function parseBody(json: any) {
  return JSON.parse(json.result.contents[0].text);
}

describe('resources', () => {
  it('resources/templates/list advertises all four resource templates', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await rpc(handler, 'resources/templates/list');
    expect(status).toBe(200);
    const templates = json.result.resourceTemplates;
    const names = templates.map((t: any) => t.name).sort();
    expect(names).toEqual(['group', 'leaderboard', 'post', 'user_profile']);
  });

  it('reads a user_profile resource by slug', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await read(handler, 'community://users/john');
    expect(status).toBe(200);
    expect(json.result.contents[0].uri).toBe('community://users/john');
    expect(json.result.contents[0].mimeType).toBe('application/json');
    expect(parseBody(json)).toEqual({ kind: 'user', slug: 'john' });
  });

  it('reads a group resource by slug', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await read(handler, 'community://groups/ops');
    expect(status).toBe(200);
    expect(parseBody(json)).toEqual({ kind: 'group', slug: 'ops' });
  });

  it('reads a post resource by id', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await read(handler, 'community://posts/550e8400-e29b-41d4-a716-446655440000');
    expect(status).toBe(200);
    expect(parseBody(json)).toEqual({ kind: 'post', id: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('reads a leaderboard resource by type (path variable)', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await read(handler, 'community://leaderboards/all-time');
    expect(status).toBe(200);
    expect(parseBody(json)).toEqual({ kind: 'leaderboard', type: 'all-time' });
  });

  it('reads a group-scoped leaderboard resource by type', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await read(handler, 'community://leaderboards/operator-stack');
    expect(status).toBe(200);
    expect(parseBody(json)).toEqual({ kind: 'leaderboard', type: 'operator-stack' });
  });

  it('forwards the authInfo context into resource handlers', async () => {
    let seenClientId: string | undefined;
    const handler = createMcpHandler(() => {
      const services = {
        ...makeServices(),
        getUserProfileBySlug: async (_slug: string, ctx: any) => {
          seenClientId = ctx.clientId;
          return { kind: 'user' };
        },
      } as McpResourceServices & McpToolServices;
      return createCommunityMcpServer({ services, logger: noop });
    });
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: 'community://users/john', _meta: ENV },
    };
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'resources/read',
        'mcp-name': 'community://users/john',
      },
      body: JSON.stringify(body),
    });
    await handler.fetch(req, {
      authInfo: { token: 't', clientId: 'client-from-auth', scopes: ['community:read'] },
    });
    expect(seenClientId).toBe('client-from-auth');
  });
});