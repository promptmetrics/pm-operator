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

async function rpc(
  handler: ReturnType<typeof makeHandler>,
  method: string,
  params: Record<string, unknown>,
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

async function callTool(handler: ReturnType<typeof makeHandler>, name: string, args: Record<string, unknown>) {
  return rpc(handler, 'tools/call', { name, arguments: args }, { 'mcp-name': name });
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
  it('tools/list advertises all four tools with an outputSchema', async () => {
    const handler = makeHandler(makeServices());
    const { status, json } = await rpc(handler, 'tools/list', {});
    expect(status).toBe(200);
    const tools = json.result.tools;
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      'get_user_profile',
      'list_leaderboards',
      'search_posts',
      'summarize_thread',
    ]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
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