import { describe, it, expect } from 'vitest';
import {
  searchPostsSchema,
  getUserProfileSchema,
  listLeaderboardsSchema,
  summarizeThreadSchema,
  type McpToolServices,
} from './tools';
import { createCommunityMcpServer, createMcpHandler } from './server';
import type { McpResourceServices } from './resources';

const noop = { debug() {}, info() {}, warn() {}, error() {} };

// --- Valid output fixtures (must satisfy each tool's outputSchema) --------
const searchResult = {
  id: 'post-1',
  slug: 'hello-world',
  title: 'Hello',
  type: 'discussion',
  status: 'published',
  isSolved: false,
  group: { slug: 'ops', name: 'Operator', color: '#3b82f6' },
  author: { userslug: 'john', username: 'John', reputationScore: 12, acceptedSolutions: 3, level: 2 },
  upvotes: 5,
  commentCount: 2,
  viewCount: 10,
  tags: ['intro', 'mcp'],
  excerpt: 'An intro post',
  createdAt: '2026-01-01T00:00:00Z',
  coverImageUrl: null,
  rank: 1,
};

const userProfile = {
  id: 'user-1',
  username: 'John',
  userslug: 'john',
  fullName: 'John Doe',
  pictureUrl: null,
  role: 'member',
  reputationScore: 12,
  streakDays: 3,
  acceptedSolutions: 3,
  level: 2,
  aboutMe: null,
  postsCount: 7,
  joinedAt: '2026-01-01T00:00:00Z',
  levelInfo: {
    level: 2,
    name: 'Contributor',
    nextLevel: { level: 3, name: 'Expert', minScore: 100 },
    pointsToNext: 50,
    progressPercent: 0.5,
  },
  followerCount: 1,
  followingCount: 2,
};

const leaderboardEntry = {
  rank: 1,
  userslug: 'john',
  username: 'John',
  score: 12,
  acceptedSolutions: 3,
  level: 2,
  streakDays: 3,
  role: 'member',
};

function makeServices(overrides: Partial<McpToolServices & McpResourceServices> = {}): McpToolServices & McpResourceServices {
  return {
    searchPosts: async () => ({ results: [searchResult], nextCursor: undefined }),
    getUserProfile: async () => userProfile,
    listLeaderboards: async (input: any) => ({ type: input.type, period: input.period, entries: [leaderboardEntry] }),
    summarizeThread: async (input: any) => ({
      post_id: input.post_id,
      title: 'Hello',
      summary: 'A short summary',
      comment_count: 2,
      max_length: input.max_length,
    }),
    getUserProfileBySlug: async () => userProfile,
    getGroupBySlug: async () => ({}),
    getPostById: async () => ({}),
    getLeaderboard: async () => ({}),
    ...overrides,
  } as McpToolServices & McpResourceServices;
}

// Modern (2026-07-28) JSON-RPC request envelope + required headers.
const ENV = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

function makeHandler(services: McpToolServices & McpResourceServices) {
  return createMcpHandler(() => createCommunityMcpServer({ services, logger: noop }));
}

// authInfo injected via handler.fetch. toContext (tools.ts) reads scopes and
// extra.userId off this, so varying it drives the scope/user-binding tests.
type TestAuth = {
  token: string;
  clientId: string;
  scopes: string[];
  extra?: { userId?: string };
};
const READ_AUTH: TestAuth = { token: 't', clientId: 'c', scopes: ['community:read'] };

async function rpc(
  handler: ReturnType<typeof makeHandler>,
  method: string,
  params: Record<string, unknown>,
  headers: Record<string, string> = {},
  auth: TestAuth = READ_AUTH
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
  const res = await handler.fetch(req, { authInfo: auth });
  return { status: res.status, json: await res.json() };
}

async function callTool(
  handler: ReturnType<typeof makeHandler>,
  name: string,
  args: Record<string, unknown>,
  auth?: TestAuth
) {
  return rpc(handler, 'tools/call', { name, arguments: args }, { 'mcp-name': name }, auth);
}

describe('tool schemas', () => {
  describe('searchPostsSchema', () => {
    it('accepts a minimal valid query', () => {
      const result = searchPostsSchema.safeParse({ query: 'hello' });
      expect(result.success).toBe(true);
    });

    it('accepts a fully populated valid query', () => {
      const result = searchPostsSchema.safeParse({
        query: 'hello',
        group_slug: 'my-group',
        tags: ['tag1', 'tag2'],
        sort: 'top',
        page: 2,
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty query', () => {
      const result = searchPostsSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid sort value', () => {
      const result = searchPostsSchema.safeParse({ query: 'hello', sort: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects out-of-range limit', () => {
      const result = searchPostsSchema.safeParse({ query: 'hello', limit: 100 });
      expect(result.success).toBe(false);
    });
  });

  describe('getUserProfileSchema', () => {
    it('accepts a valid user slug', () => {
      const result = getUserProfileSchema.safeParse({ user_slug: 'john-doe' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty user slug', () => {
      const result = getUserProfileSchema.safeParse({ user_slug: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing user slug', () => {
      const result = getUserProfileSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('listLeaderboardsSchema', () => {
    it('accepts a valid minimal request', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'all-time' });
      expect(result.success).toBe(true);
    });

    it('accepts a valid request with group and period', () => {
      const result = listLeaderboardsSchema.safeParse({
        type: 'operator-stack',
        group_slug: 'ops',
        period: 'weekly',
        page: 1,
        limit: 25,
      });
      expect(result.success).toBe(true);
    });

    it('accepts monthly (now materialized by the points trigger)', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'all-time', period: 'monthly' });
      expect(result.success).toBe(true);
    });

    it('rejects quarterly (no longer advertised — not materialized)', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'all-time', period: 'quarterly' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid leaderboard type', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid period', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'all-time', period: 'daily' });
      expect(result.success).toBe(false);
    });
  });

  describe('summarizeThreadSchema', () => {
    it('accepts a valid UUID post id', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a custom max_length', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
        max_length: 500,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-UUID post id', () => {
      const result = summarizeThreadSchema.safeParse({ post_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('rejects max_length below the minimum', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
        max_length: 10,
      });
      expect(result.success).toBe(false);
    });

    it('rejects max_length above the maximum', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
        max_length: 5000,
      });
      expect(result.success).toBe(false);
    });
  });
});

// --- Tool execution (2026-07-28 structuredContent + outputSchema) --------
describe('tool execution', () => {
  it('tools/list advertises all 38 tools; read tools carry an outputSchema, write/admin do not', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await rpc(handler, 'tools/list', {});
    expect(status).toBe(200);
    const tools = json.result.tools;
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      'accept_solution',
      'admin_award_badge',
      'admin_award_points',
      'admin_create_badge',
      'admin_create_group',
      'admin_create_watched_phrase',
      'admin_delete_flag',
      'admin_delete_group',
      'admin_delete_user',
      'admin_delete_watched_phrase',
      'admin_get_user',
      'admin_list_audit_logs',
      'admin_list_badges',
      'admin_list_groups',
      'admin_list_mcp_clients',
      'admin_list_users',
      'admin_list_watched_phrases',
      'admin_resolve_flag',
      'admin_revoke_mcp_client',
      'admin_set_user_role',
      'admin_update_group',
      'admin_update_settings',
      'create_comment',
      'create_post',
      'delete_comment',
      'delete_post',
      'follow_user',
      'get_user_profile',
      'join_circle',
      'leave_circle',
      'list_leaderboards',
      'search_posts',
      'summarize_thread',
      'toggle_bookmark',
      'toggle_reaction',
      'unfollow_user',
      'update_comment',
      'update_post',
    ]);
    // Read tools validate a structured outputSchema; write/admin tools return
    // JSON as text only (heterogeneous shapes), so they carry none.
    const READ = new Set(['search_posts', 'get_user_profile', 'list_leaderboards', 'summarize_thread']);
    for (const tool of tools) {
      if (READ.has(tool.name)) {
        expect(tool.outputSchema).toBeDefined();
      } else {
        expect(tool.outputSchema).toBeUndefined();
      }
    }
    // Hard-delete tools announce destructiveHint.
    const DESTRUCTIVE = new Set(['delete_post', 'delete_comment', 'admin_delete_user', 'admin_delete_group']);
    for (const tool of tools) {
      if (DESTRUCTIVE.has(tool.name)) {
        expect(tool.annotations?.destructiveHint).toBe(true);
      }
    }
  });

  it('search_posts returns structuredContent that validates against the outputSchema', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await callTool(handler, 'search_posts', { query: 'hello' });
    expect(status).toBe(200);
    const result = json.result;
    expect(result.isError).toBeFalsy();
    expect(result.resultType).toBe('complete');
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.results).toHaveLength(1);
    expect(result.structuredContent.results[0]).toMatchObject({ slug: 'hello-world', rank: 1 });
  });

  it('get_user_profile returns structuredContent for a found user', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await callTool(handler, 'get_user_profile', { user_slug: 'john' });
    expect(status).toBe(200);
    const result = json.result;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.userslug).toBe('john');
    expect(result.structuredContent.levelInfo.level).toBe(2);
  });

  it('get_user_profile returns an isError result when the user is not found', async () => {
    const handler = makeHandler(makeServices({ getUserProfile: async () => null }));
    const { status, json } = await callTool(handler, 'get_user_profile', { user_slug: 'nope' });
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('User not found');
    expect(json.result.structuredContent).toBeUndefined();
  });

  it('list_leaderboards returns structuredContent with entries', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await callTool(handler, 'list_leaderboards', {
      type: 'all-time',
      period: 'weekly',
    });
    expect(status).toBe(200);
    const result = json.result;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.entries[0]).toMatchObject({ rank: 1, userslug: 'john' });
  });

  it('summarize_thread returns structuredContent', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await callTool(handler, 'summarize_thread', {
      post_id: '550e8400-e29b-41d4-a716-446655440000',
      max_length: 200,
    });
    expect(status).toBe(200);
    const result = json.result;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ comment_count: 2, max_length: 200 });
  });

  it('rejects a service return that does not satisfy the outputSchema', async () => {
    // searchPosts returns a result missing required fields → outputSchema
    // validation fails → isError result with an "Output validation error".
    const handler = makeHandler({
      ...makeServices(),
      searchPosts: async () => ({ results: [{ id: 'p1', title: 'T', rank: 1 }] } as any),
    });
    const { status, json } = await callTool(handler, 'search_posts', { query: 'hi' });
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('Output validation error');
    expect(json.result.structuredContent).toBeUndefined();
  });
});

// --- write/admin scope + user-binding enforcement ------------------------
// The scope gate (requireScope) and the user-bound gate (requireUserId) live
// in tools.ts and are exercised here. The db-backed requireGlobalAdmin check
// lives in the web service wrapper (wrapAdminTool), not in this package, so
// these tests cover the package-level gate only.
describe('write/admin scope + user-binding enforcement', () => {
  const WRITE_AUTH: TestAuth = {
    token: 't',
    clientId: 'c',
    scopes: ['community:read', 'community:write'],
    extra: { userId: 'user-1' },
  };
  const ADMIN_AUTH: TestAuth = {
    token: 't',
    clientId: 'c',
    scopes: ['community:read', 'community:write', 'community:admin'],
    extra: { userId: 'user-1' },
  };
  const WRITE_NO_USER: TestAuth = {
    token: 't',
    clientId: 'c',
    scopes: ['community:read', 'community:write'],
  };

  it('denies a write tool when the token lacks community:write (service never called)', async () => {
    let called = false;
    const handler = makeHandler(
      makeServices({ createPost: async () => { called = true; return {}; } } as any)
    );
    const { status, json } = await callTool(handler, 'create_post', {
      group_slug: 'ops',
      title: 'T',
      content: 'c',
    });
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('Missing required scope: community:write');
    expect(called).toBe(false);
  });

  it('denies a write tool when scoped but no user is bound (service never called)', async () => {
    let called = false;
    const handler = makeHandler(
      makeServices({ createPost: async () => { called = true; return {}; } } as any)
    );
    const { status, json } = await callTool(
      handler,
      'create_post',
      { group_slug: 'ops', title: 'T', content: 'c' },
      WRITE_NO_USER
    );
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('user-bound token');
    expect(called).toBe(false);
  });

  it('allows a write tool with community:write + bound user and calls the service as that user', async () => {
    let calledAs: string | undefined;
    const handler = makeHandler(
      makeServices({
        createPost: async (_input: any, ctx: any) => {
          calledAs = ctx.userId;
          return { id: 'post-1', slug: 't' };
        },
      } as any)
    );
    const { status, json } = await callTool(
      handler,
      'create_post',
      { group_slug: 'ops', title: 'T', content: 'c' },
      WRITE_AUTH
    );
    expect(status).toBe(200);
    expect(json.result.isError).toBeFalsy();
    expect(calledAs).toBe('user-1');
    expect(json.result.content[0].text).toContain('post-1');
  });

  it('denies an admin tool when the token lacks community:admin (service never called)', async () => {
    let called = false;
    const handler = makeHandler(
      makeServices({ adminSetUserRole: async () => { called = true; return {}; } } as any)
    );
    const { status, json } = await callTool(
      handler,
      'admin_set_user_role',
      { user_slug: 'u', role: 'moderator' },
      WRITE_AUTH
    );
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('Missing required scope: community:admin');
    expect(called).toBe(false);
  });

  it('denies an admin tool when scoped but no user is bound', async () => {
    let called = false;
    const handler = makeHandler(
      makeServices({ adminSetUserRole: async () => { called = true; return {}; } } as any)
    );
    const { status, json } = await callTool(
      handler,
      'admin_set_user_role',
      { user_slug: 'u', role: 'moderator' },
      { token: 't', clientId: 'c', scopes: ['community:read', 'community:admin'] }
    );
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('user-bound token');
    expect(called).toBe(false);
  });

  it('allows an admin tool with community:admin + bound user (scope gate only; DB admin check is in the service wrapper)', async () => {
    let calledAs: string | undefined;
    const handler = makeHandler(
      makeServices({
        adminSetUserRole: async (_input: any, ctx: any) => {
          calledAs = ctx.userId;
          return { ok: true };
        },
      } as any)
    );
    const { status, json } = await callTool(
      handler,
      'admin_set_user_role',
      { user_slug: 'u', role: 'moderator' },
      ADMIN_AUTH
    );
    expect(status).toBe(200);
    expect(json.result.isError).toBeFalsy();
    expect(calledAs).toBe('user-1');
  });

  it('allows a no-input admin tool (admin_list_groups) with community:admin + bound user', async () => {
    let calledAs: string | undefined;
    const handler = makeHandler(
      makeServices({
        adminListGroups: async (ctx: any) => {
          calledAs = ctx.userId;
          return [{ slug: 'ops', name: 'Ops' }];
        },
      } as any)
    );
    const { status, json } = await callTool(handler, 'admin_list_groups', {}, ADMIN_AUTH);
    expect(status).toBe(200);
    expect(json.result.isError).toBeFalsy();
    expect(calledAs).toBe('user-1');
    expect(json.result.content[0].text).toContain('ops');
  });
});