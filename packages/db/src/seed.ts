import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(workspaceRoot, '.env') });
dotenv.config({ path: path.resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: path.resolve(workspaceRoot, 'apps/web/.env.local') });

const {
  users,
  groups,
  groupMemberships,
  posts,
  comments,
  reactions,
  badges,
  membershipTiers,
  watchedPhrases,
} = schema;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const client = postgres(databaseUrl, { prepare: false, max: 10 });
const db = drizzle(client, { schema });

const now = new Date();

function slugify(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'post'}-${id.slice(0, 8)}`;
}

// Deterministic UUIDs for idempotent seeding.
// PostgreSQL's uuid type validates version/variant bits. Some prefixes only
// have 3 groups; we pad to 4, then rewrite the 3rd group to start with 4 and
// the 4th group to start with 8 so the whole string is a valid UUID v4 variant.
function uid(prefix: string, n: number): string {
  const suffix = n.toString().padStart(12, '0');
  const base = prefix.replace(/-$/, '');
  const parts = base.split('-');
  while (parts.length < 4) parts.push('0000');
  parts[2] = `4${parts[2].slice(1)}`;
  parts[3] = `8${parts[3].slice(1)}`;
  return `${parts.slice(0, 4).join('-')}-${suffix}`;
}

const globalGroupId = '00000000-0000-0000-0000-000000000000';

const groupIds = {
  general: uid('11111111-1111-1111-1111-', 1),
  showYourBuild: uid('22222222-2222-2222-2222-', 1),
  mcpServers: uid('33333333-3333-3333-3333-', 1),
  vercelAiSdk: uid('44444444-4444-4444-4444-', 1),
  multiAgent: uid('55555555-5555-5555-5555-', 1),
};

const groupList = [
  { id: globalGroupId, slug: 'global', name: 'Global', description: 'Sentinel group for global leaderboard scores. Not a real circle.', visibility: 'public', color: null },
  { id: groupIds.general, slug: 'general', name: 'General', description: 'Community-wide announcements, introductions, and open discussion.', visibility: 'public', color: '#64748b' },
  { id: groupIds.showYourBuild, slug: 'show-your-build', name: 'Show Your Build', description: 'Ships, tools, and demos from the operator community.', visibility: 'public', color: '#10b981' },
  { id: groupIds.mcpServers, slug: 'mcp-servers', name: 'MCP Servers', description: 'Building, deploying, and connecting Model Context Protocol servers.', visibility: 'public', color: '#8b5cf6' },
  { id: groupIds.vercelAiSdk, slug: 'vercel-ai-sdk', name: 'Vercel AI SDK', description: 'Patterns, providers, and production tips for the AI SDK.', visibility: 'public', color: '#000000' },
  { id: groupIds.multiAgent, slug: 'multi-agent-orchestration', name: 'Multi-agent Orchestration', description: 'Evals, routing, and coordination for multi-agent systems.', visibility: 'public', color: '#f59e0b' },
] as const;

const seedUsers = [
  { id: uid('10000000-0000-0000-0000-', 1), email: 'alex@example.com', username: 'Alex Ríos', userslug: 'alexrios', fullName: 'Alex Ríos', role: 'admin' },
  { id: uid('10000000-0000-0000-0000-', 2), email: 'maya@example.com', username: 'Maya Chen', userslug: 'mayachen', fullName: 'Maya Chen', role: 'moderator' },
  { id: uid('10000000-0000-0000-0000-', 3), email: 'noah@example.com', username: 'Noah Park', userslug: 'noahpark', fullName: 'Noah Park', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 4), email: 'sasha@example.com', username: 'Sasha Volkov', userslug: 'sashavolkov', fullName: 'Sasha Volkov', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 5), email: 'jordan@example.com', username: 'Jordan Bell', userslug: 'jordanbell', fullName: 'Jordan Bell', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 6), email: 'taylor@example.com', username: 'Taylor Kim', userslug: 'taylorkim', fullName: 'Taylor Kim', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 7), email: 'casey@example.com', username: 'Casey Rivera', userslug: 'caseyrivera', fullName: 'Casey Rivera', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 8), email: 'drew@example.com', username: 'Drew Patel', userslug: 'drewpatel', fullName: 'Drew Patel', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 9), email: 'riley@example.com', username: 'Riley Okafor', userslug: 'rileyokafor', fullName: 'Riley Okafor', role: 'member' },
  { id: uid('10000000-0000-0000-0000-', 10), email: 'quinn@example.com', username: 'Quinn Murphy', userslug: 'quinnmurphy', fullName: 'Quinn Murphy', role: 'member' },
] satisfies Array<{
  id: string;
  email: string;
  username: string;
  userslug: string;
  fullName: string;
  role: 'admin' | 'moderator' | 'member';
}>;

const seedPosts = [
  { id: uid('20000000-0000-0000-0000-', 1), groupId: groupIds.general, authorId: uid('10000000-0000-0000-', 1), title: 'Welcome to operator.promptmetrics.dev', content: '<p>This is the new home for operator-level tooling discussion. Introduce yourself below.</p>', contentPlain: 'This is the new home for operator-level tooling discussion. Introduce yourself below.', type: 'discussion', tags: ['intro', 'community'], upvotes: 5 },
  { id: uid('20000000-0000-0000-0000-', 2), groupId: groupIds.showYourBuild, authorId: uid('10000000-0000-0000-', 3), title: 'Open-source MCP router we shipped last week', content: '<p>We built a tiny MCP gateway that handles OAuth, routing, and observability. Repo in comments.</p>', contentPlain: 'We built a tiny MCP gateway that handles OAuth, routing, and observability. Repo in comments.', type: 'build', tags: ['mcp', 'router', 'open-source'], upvotes: 8 },
  { id: uid('20000000-0000-0000-0000-', 3), groupId: groupIds.mcpServers, authorId: uid('10000000-0000-0000-', 4), title: 'How do you auth MCP clients against your own user database?', content: '<p>Looking for patterns that keep the MCP server stateless but still verify the calling user.</p>', contentPlain: 'Looking for patterns that keep the MCP server stateless but still verify the calling user.', type: 'question', tags: ['mcp', 'auth'], upvotes: 4 },
  { id: uid('20000000-0000-0000-0000-', 4), groupId: groupIds.vercelAiSdk, authorId: uid('10000000-0000-0000-', 5), title: 'Streaming structured output with useObject in production', content: '<p>We switched from manual parsing to useObject and cut error rates by half. Lessons learned inside.</p>', contentPlain: 'We switched from manual parsing to useObject and cut error rates by half. Lessons learned inside.', type: 'discussion', tags: ['ai-sdk', 'streaming'], upvotes: 6 },
  { id: uid('20000000-0000-0000-0000-', 5), groupId: groupIds.multiAgent, authorId: uid('10000000-0000-0000-', 6), title: 'Evals for multi-agent routing: what actually works?', content: '<p>We have ten agent variants and need a routing benchmark that predicts real task success.</p>', contentPlain: 'We have ten agent variants and need a routing benchmark that predicts real task success.', type: 'question', tags: ['evals', 'routing', 'multi-agent'], upvotes: 3 },
  { id: uid('20000000-0000-0000-0000-', 6), groupId: groupIds.showYourBuild, authorId: uid('10000000-0000-0000-', 7), title: 'Prompt version control with git-like diffs', content: '<p>Built a small CLI that diffs prompt variants and pins them to eval runs.</p>', contentPlain: 'Built a small CLI that diffs prompt variants and pins them to eval runs.', type: 'build', tags: ['prompts', 'evals', 'cli'], upvotes: 7 },
  { id: uid('20000000-0000-0000-0000-', 7), groupId: groupIds.general, authorId: uid('10000000-0000-0000-', 2), title: 'Weekly highlights: MCP auth, AI SDK patterns, and a new leaderboard', content: '<p>A quick recap of the top posts and contributors this week.</p>', contentPlain: 'A quick recap of the top posts and contributors this week.', type: 'discussion', tags: ['highlights', 'leaderboard'], upvotes: 2 },
  { id: uid('20000000-0000-0000-0000-', 8), groupId: groupIds.mcpServers, authorId: uid('10000000-0000-0000-', 8), title: 'Hosting MCP servers on Vercel functions: cold-start notes', content: '<p>Measured cold starts for stdio-wrapped vs native HTTP MCP servers. Numbers attached.</p>', contentPlain: 'Measured cold starts for stdio-wrapped vs native HTTP MCP servers. Numbers attached.', type: 'discussion', tags: ['mcp', 'vercel', 'performance'], upvotes: 5 },
  { id: uid('20000000-0000-0000-0000-', 9), groupId: groupIds.vercelAiSdk, authorId: uid('10000000-0000-0000-', 9), title: 'Tool calling latency across providers', content: '<p>Benchmarked OpenAI, Anthropic, and Gemini tool calls for our routing use case.</p>', contentPlain: 'Benchmarked OpenAI, Anthropic, and Gemini tool calls for our routing use case.', type: 'discussion', tags: ['ai-sdk', 'providers', 'latency'], upvotes: 4 },
  { id: uid('20000000-0000-0000-0000-', 10), groupId: groupIds.multiAgent, authorId: uid('10000000-0000-0000-', 10), title: 'Orchestration patterns: supervisor vs. market vs. graph', content: '<p>Comparing three architectures we prototyped for a customer-support agent team.</p>', contentPlain: 'Comparing three architectures we prototyped for a customer-support agent team.', type: 'discussion', tags: ['multi-agent', 'patterns'], upvotes: 6 },
  { id: uid('20000000-0000-0000-0000-', 11), groupId: groupIds.showYourBuild, authorId: uid('10000000-0000-0000-', 1), title: 'A no-code prompt testing UI for non-engineers', content: '<p>Our ops team needed a safe way to edit and run prompts. We shipped a tiny internal UI.</p>', contentPlain: 'Our ops team needed a safe way to edit and run prompts. We shipped a tiny internal UI.', type: 'build', tags: ['prompts', 'ui', 'tools'], upvotes: 9 },
  { id: uid('20000000-0000-0000-0000-', 12), groupId: groupIds.mcpServers, authorId: uid('10000000-0000-0000-', 3), title: 'Rate-limiting MCP tool calls with Upstash', content: '<p>How we added per-client rate limits without changing the MCP server code.</p>', contentPlain: 'How we added per-client rate limits without changing the MCP server code.', type: 'discussion', tags: ['mcp', 'rate-limit', 'upstash'], upvotes: 3 },
  { id: uid('20000000-0000-0000-0000-', 13), groupId: groupIds.vercelAiSdk, authorId: uid('10000000-0000-0000-', 4), title: 'useChat message persistence strategies', content: '<p>Where do you store conversation history? Trade-offs for local, server, and hybrid storage.</p>', contentPlain: 'Where do you store conversation history? Trade-offs for local, server, and hybrid storage.', type: 'question', tags: ['ai-sdk', 'chat', 'storage'], upvotes: 4 },
  { id: uid('20000000-0000-0000-0000-', 14), groupId: groupIds.multiAgent, authorId: uid('10000000-0000-0000-', 5), title: 'Agent handoff protocol using structured outputs', content: '<p>We use a shared JSON schema for handoff context so any agent can resume work.</p>', contentPlain: 'We use a shared JSON schema for handoff context so any agent can resume work.', type: 'discussion', tags: ['multi-agent', 'schema', 'handoff'], upvotes: 5 },
  { id: uid('20000000-0000-0000-0000-', 15), groupId: groupIds.general, authorId: uid('10000000-0000-0000-', 6), title: 'What painful tool-stack task should we tackle first?', content: '<p>Tell us the hardest part of your operator stack and we will prioritize content around it.</p>', contentPlain: 'Tell us the hardest part of your operator stack and we will prioritize content around it.', type: 'question', tags: ['operator-stack', 'feedback'], upvotes: 2 },
  { id: uid('20000000-0000-0000-0000-', 16), groupId: groupIds.showYourBuild, authorId: uid('10000000-0000-0000-', 7), title: 'Eval runner that posts results back to Slack', content: '<p>Automated nightly evals with summaries posted to a team channel.</p>', contentPlain: 'Automated nightly evals with summaries posted to a team channel.', type: 'build', tags: ['evals', 'slack', 'automation'], upvotes: 6 },
  { id: uid('20000000-0000-0000-0000-', 17), groupId: groupIds.mcpServers, authorId: uid('10000000-0000-0000-', 8), title: 'Securing server-side MCP context against prompt injection', content: '<p>Lessons from auditing tool descriptions and system prompts for privilege escalation.</p>', contentPlain: 'Lessons from auditing tool descriptions and system prompts for privilege escalation.', type: 'discussion', tags: ['mcp', 'security', 'prompt-injection'], upvotes: 7 },
  { id: uid('20000000-0000-0000-0000-', 18), groupId: groupIds.vercelAiSdk, authorId: uid('10000000-0000-0000-', 9), title: 'Custom data streams with createDataStream', content: '<p>We stream tool results, citations, and UI patches through a single response.</p>', contentPlain: 'We stream tool results, citations, and UI patches through a single response.', type: 'discussion', tags: ['ai-sdk', 'streaming', 'ui'], upvotes: 4 },
  { id: uid('20000000-0000-0000-0000-', 19), groupId: groupIds.multiAgent, authorId: uid('10000000-0000-0000-', 10), title: 'Cost attribution per agent step', content: '<p>How we trace token spend back to individual agents and decisions in a run.</p>', contentPlain: 'How we trace token spend back to individual agents and decisions in a run.', type: 'discussion', tags: ['multi-agent', 'cost', 'observability'], upvotes: 5 },
  { id: uid('20000000-0000-0000-0000-', 20), groupId: groupIds.general, authorId: uid('10000000-0000-0000-', 1), title: 'Community guidelines and moderation FAQ', content: '<p>What to post, how to flag, and how points work.</p>', contentPlain: 'What to post, how to flag, and how points work.', type: 'discussion', tags: ['guidelines', 'moderation'], upvotes: 3 },
  { id: uid('20000000-0000-0000-0000-', 21), groupId: groupIds.showYourBuild, authorId: uid('10000000-0000-0000-', 2), title: 'A typed fetch client generated from Zod contracts', content: '<p>We generate the API client from the same Zod schemas the server uses.</p>', contentPlain: 'We generate the API client from the same Zod schemas the server uses.', type: 'build', tags: ['api', 'zod', 'typescript'], upvotes: 8 },
  { id: uid('20000000-0000-0000-0000-', 22), groupId: groupIds.mcpServers, authorId: uid('10000000-0000-0000-', 3), title: 'MCP resource templates for community posts', content: '<p>Exposing posts and leaderboards as MCP resources for agent clients.</p>', contentPlain: 'Exposing posts and leaderboards as MCP resources for agent clients.', type: 'discussion', tags: ['mcp', 'resources', 'agents'], upvotes: 4 },
  { id: uid('20000000-0000-0000-0000-', 23), groupId: groupIds.vercelAiSdk, authorId: uid('10000000-0000-0000-', 4), title: 'Provider fallback logic with the AI SDK', content: '<p>Switching providers when rate limits hit, without dropping user context.</p>', contentPlain: 'Switching providers when rate limits hit, without dropping user context.', type: 'discussion', tags: ['ai-sdk', 'providers', 'resilience'], upvotes: 5 },
  { id: uid('20000000-0000-0000-0000-', 24), groupId: groupIds.multiAgent, authorId: uid('10000000-0000-0000-', 5), title: 'Replanning loops: when to stop and ask a human', content: '<p>Setting uncertainty thresholds so agents escalate instead of hallucinating forward.</p>', contentPlain: 'Setting uncertainty thresholds so agents escalate instead of hallucinating forward.', type: 'discussion', tags: ['multi-agent', 'planning', 'human-in-the-loop'], upvotes: 6 },
  { id: uid('20000000-0000-0000-0000-', 25), groupId: groupIds.general, authorId: uid('10000000-0000-0000-', 6), title: 'Looking for beta testers for the new feed', content: '<p>We need a few operators to kick the tires on filters, search, and real-time comments.</p>', contentPlain: 'We need a few operators to kick the tires on filters, search, and real-time comments.', type: 'discussion', tags: ['beta', 'feed', 'search'], upvotes: 2 },
] satisfies Array<{
  id: string;
  groupId: string;
  authorId: string;
  title: string;
  content: string;
  contentPlain: string;
  type: 'discussion' | 'question' | 'build' | 'lesson';
  tags: string[];
  upvotes: number;
}>;

const seedComments = [
  { id: uid('30000000-0000-0000-0000-', 1), postId: uid('20000000-0000-0000-0000-', 3), authorId: uid('10000000-0000-0000-', 5), content: '<p>We issue short-lived JWTs signed with a shared secret and validate them in the MCP auth middleware.</p>', contentPlain: 'We issue short-lived JWTs signed with a shared secret and validate them in the MCP auth middleware.', upvotes: 3 },
  { id: uid('30000000-0000-0000-0000-', 2), postId: uid('20000000-0000-0000-0000-', 5), authorId: uid('10000000-0000-0000-', 9), content: '<p>Human-eval on a held-out task set plus an LLM-as-judge reranker has worked best for us.</p>', contentPlain: 'Human-eval on a held-out task set plus an LLM-as-judge reranker has worked best for us.', upvotes: 2 },
  { id: uid('30000000-0000-0000-0000-', 3), postId: uid('20000000-0000-0000-0000-', 13), authorId: uid('10000000-0000-0000-', 7), content: '<p>Hybrid: keep recent messages server-side for context, older threads in cheap object storage.</p>', contentPlain: 'Hybrid: keep recent messages server-side for context, older threads in cheap object storage.', upvotes: 2 },
  { id: uid('30000000-0000-0000-0000-', 4), postId: uid('20000000-0000-0000-0000-', 2), authorId: uid('10000000-0000-0000-', 1), content: '<p>Would love to see the repo. This is exactly the missing piece in our stack.</p>', contentPlain: 'Would love to see the repo. This is exactly the missing piece in our stack.', upvotes: 1 },
  { id: uid('30000000-0000-0000-0000-', 5), postId: uid('20000000-0000-0000-0000-', 8), authorId: uid('10000000-0000-0000-', 4), content: '<p>Native HTTP is 2-3x faster on cold start in our tests, but tooling is still rough.</p>', contentPlain: 'Native HTTP is 2-3x faster on cold start in our tests, but tooling is still rough.', upvotes: 2 },
  { id: uid('30000000-0000-0000-0000-', 6), postId: uid('20000000-0000-0000-0000-', 14), authorId: uid('10000000-0000-0000-', 8), content: '<p>We added a required resume_token field so agents cannot accidentally drop context.</p>', contentPlain: 'We added a required resume_token field so agents cannot accidentally drop context.', upvotes: 1 },
  { id: uid('30000000-0000-0000-0000-', 7), postId: uid('20000000-0000-0000-0000-', 17), authorId: uid('10000000-0000-0000-', 2), content: '<p>Great summary. We also sanitize tool descriptions against the user prompt to prevent tool-name leakage.</p>', contentPlain: 'Great summary. We also sanitize tool descriptions against the user prompt to prevent tool-name leakage.', upvotes: 3 },
  { id: uid('30000000-0000-0000-0000-', 8), postId: uid('20000000-0000-0000-0000-', 10), authorId: uid('10000000-0000-0000-', 3), content: '<p>Supervisor is simplest to debug; market-based routing wins when task types are stable.</p>', contentPlain: 'Supervisor is simplest to debug; market-based routing wins when task types are stable.', upvotes: 2 },
  { id: uid('30000000-0000-0000-0000-', 9), postId: uid('20000000-0000-0000-0000-', 3), authorId: uid('10000000-0000-0000-', 3), content: '<p>Do you rotate the secret per deployment or share one across replicas?</p>', contentPlain: 'Do you rotate the secret per deployment or share one across replicas?', parentCommentId: uid('30000000-0000-0000-0000-', 1), upvotes: 1 },
  { id: uid('30000000-0000-0000-0000-', 10), postId: uid('20000000-0000-0000-0000-', 3), authorId: uid('10000000-0000-0000-', 5), content: '<p>One secret per deployment plus automatic rotation via Vercel env every 90 days.</p>', contentPlain: 'One secret per deployment plus automatic rotation via Vercel env every 90 days.', parentCommentId: uid('30000000-0000-0000-0000-', 1), upvotes: 1 },
] satisfies Array<{
  id: string;
  postId: string;
  authorId: string;
  parentCommentId?: string;
  content: string;
  contentPlain: string;
  upvotes: number;
}>;

const seedReactions = [
  { id: uid('40000000-0000-0000-0000-', 1), userId: uid('10000000-0000-0000-', 1), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 2), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 2), userId: uid('10000000-0000-0000-', 2), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 2), reactionType: 'celebrate' },
  { id: uid('40000000-0000-0000-0000-', 3), userId: uid('10000000-0000-0000-', 3), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 4), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 4), userId: uid('10000000-0000-0000-', 4), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 6), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 5), userId: uid('10000000-0000-0000-', 5), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 6), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 6), userId: uid('10000000-0000-0000-', 6), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 11), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 7), userId: uid('10000000-0000-0000-', 7), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 11), reactionType: 'celebrate' },
  { id: uid('40000000-0000-0000-0000-', 8), userId: uid('10000000-0000-0000-', 8), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 16), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 9), userId: uid('10000000-0000-0000-', 9), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 21), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 10), userId: uid('10000000-0000-0000-', 10), targetType: 'post', targetId: uid('20000000-0000-0000-0000-', 24), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 11), userId: uid('10000000-0000-0000-', 1), targetType: 'comment', targetId: uid('30000000-0000-0000-0000-', 1), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 12), userId: uid('10000000-0000-0000-', 2), targetType: 'comment', targetId: uid('30000000-0000-0000-0000-', 1), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 13), userId: uid('10000000-0000-0000-', 3), targetType: 'comment', targetId: uid('30000000-0000-0000-0000-', 7), reactionType: 'like' },
  { id: uid('40000000-0000-0000-0000-', 14), userId: uid('10000000-0000-0000-', 4), targetType: 'comment', targetId: uid('30000000-0000-0000-0000-', 8), reactionType: 'like' },
] satisfies Array<{
  id: string;
  userId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reactionType: 'like' | 'celebrate';
}>;

const seedBadges = [
  { id: uid('50000000-0000-0000-0000-', 1), slug: 'first-build', name: 'First Build', description: 'First build post in the Show Your Build circle.', criteria: { eventType: 'topic_created', postType: 'build', groupSlug: 'show-your-build', threshold: 1 }, sortOrder: 1 },
  { id: uid('50000000-0000-0000-0000-', 2), slug: 'gatekeeper', name: 'Gatekeeper', description: '3 or more accepted solutions.', criteria: { eventType: 'solution_accepted', threshold: 3 }, sortOrder: 2 },
  { id: uid('50000000-0000-0000-0000-', 3), slug: 'open-registry-contributor', name: 'Open Registry Contributor', description: 'First lesson post in the Skill Registry circle.', criteria: { eventType: 'topic_created', postType: 'lesson', groupSlug: 'skill-registry', threshold: 1 }, sortOrder: 3 },
];

const seedTiers = [
  { id: uid('60000000-0000-0000-0000-', 1), slug: 'free', name: 'Free', description: 'Public circles and read access.', price: null, interval: 'one_time' as const, features: [], isActive: true },
  { id: uid('60000000-0000-0000-0000-', 2), slug: 'design-partner', name: 'Design Partner', description: 'Private design-partners circle and office hours.', price: '99.00', interval: 'month' as const, features: ['design-partners-circle', 'office-hours'], isActive: true },
];

const seedWatchedPhrases = [
  { id: uid('70000000-0000-0000-0000-', 1), phrase: 'guaranteed passive income', sanctionedFraming: 'revenue-share models with disclosed risks' },
  { id: uid('70000000-0000-0000-0000-', 2), phrase: 'buy now', sanctionedFraming: 'evaluate the tool against your own use case' },
];

export async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must not run in production');
  }

  console.log('Resetting seed tables...');
  await client.unsafe(`
    TRUNCATE TABLE
      mcp_clients,
      agent_actions,
      flags,
      user_badges,
      watched_phrases,
      notifications,
      reactions,
      comments,
      post_views,
      posts,
      group_invites,
      group_memberships,
      user_memberships,
      membership_tiers,
      user_scores,
      user_daily_stats,
      point_events,
      badges,
      users,
      groups
    RESTART IDENTITY CASCADE;
  `);

  console.log('Seeding groups...');
  await db.insert(groups)
    .values(groupList.map((g) => ({ ...g, createdAt: now, updatedAt: now })))
    .onConflictDoNothing();

  console.log('Seeding users...');
  await db.insert(users)
    .values(seedUsers.map((u) => ({
      ...u,
      pictureUrl: `avatars/${u.id}/avatar.png`,
      painfulToolStackTask: 'Building reliable evals for multi-agent orchestration.',
      emailConfirmed: true,
      reputationScore: '0',
      streakDays: 0,
      preferences: {},
      createdAt: now,
      updatedAt: now,
    })))
    .onConflictDoNothing();

  console.log('Seeding group memberships (everyone in every public group)...');
  const memberships = [];
  for (const user of seedUsers) {
    for (const group of groupList.filter((g) => g.slug !== 'global')) {
      memberships.push({
        groupId: group.id,
        userId: user.id,
        role: user.role === 'admin' ? ('admin' as const) : ('member' as const),
      });
    }
  }
  await db.insert(groupMemberships)
    .values(memberships)
    .onConflictDoNothing();

  console.log('Seeding membership tiers...');
  await db.insert(membershipTiers)
    .values(seedTiers.map((t) => ({ ...t, currency: 'EUR', createdAt: now, updatedAt: now })))
    .onConflictDoNothing();

  console.log('Seeding badges...');
  await db.insert(badges)
    .values(seedBadges.map((b) => ({ ...b, createdAt: now })))
    .onConflictDoNothing();

  console.log('Seeding watched phrases...');
  await db.insert(watchedPhrases)
    .values(seedWatchedPhrases.map((p) => ({ ...p, createdAt: now })))
    .onConflictDoNothing();

  console.log('Seeding posts...');
  await db.insert(posts)
    .values(seedPosts.map((p) => ({
      ...p,
      slug: slugify(p.title, p.id),
      status: 'published' as const,
      isPinned: false,
      viewCount: 0,
      commentCount: 0,
      acceptedCommentId: null,
      createdAt: now,
      updatedAt: now,
    })))
    .onConflictDoNothing();

  console.log('Seeding comments...');
  await db.insert(comments)
    .values(seedComments.map((c) => ({
      ...c,
      status: 'published' as const,
      createdAt: now,
      updatedAt: now,
    })))
    .onConflictDoNothing();

  console.log('Seeding reactions...');
  await db.insert(reactions)
    .values(seedReactions.map((r) => ({ ...r, createdAt: now })))
    .onConflictDoNothing();

  console.log('Seed complete.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await client.end();
    });
}
