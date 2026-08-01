# Technical Specification: operator.promptmetrics.dev

## 1. Architecture Overview

`operator.promptmetrics.dev` is a full-stack Next.js 16 community application backed by Supabase Postgres/Auth/Realtime/Storage. It replaces the NodeBB placeholder and exposes the same backend to humans (Paper-v3 UI) and agents (REST + MCP).

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              operator.promptmetrics.dev                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                   │
│  │   Next.js    │   │   Next.js    │   │   Supabase   │                   │
│  │  App Router  │   │  API routes  │   │   Realtime   │                   │
│  │   (RSC/RC)   │   │ /api/v1 /mcp │   │   channels   │                   │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                   │
│         │                  │                  │                           │
│         └──────────────────┴──────────────────┘                           │
│                            │                                                │
│              ┌─────────────▼──────────────┐                              │
│              │   Supabase eu-west-1     │                              │
│              │   Postgres + Auth + Storage │                              │
│              └─────────────┬───────────────┘                              │
│                            │                                                │
│         ┌──────────────────┼──────────────────┐                          │
│         ▼                  ▼                  ▼                          │
│   Upstash Redis      Loops email        MCP clients /                     │
│   rate limits        lifecycle          Claude Code                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key architectural decisions

1. **Single deploy unit.** The Next.js app in `apps/web` serves pages, `/api/v1/*`, and `/api/mcp`. This avoids a second deploy target and keeps auth/session sharing simple.
2. **Database-first domain logic.** RLS policies, triggers, and unique constraints enforce access and counter integrity before application code runs.
3. **Server-only secrets.** The Supabase service-role key, Loops API key, and MCP token secret live only in Vercel environment variables and are never accepted from clients.
4. **Read-first MCP.** The MCP route is feature-flagged and ships with four read tools first. Write/admin tools are added after the human UI is live.
5. **EU residency.** Supabase production project is created in `eu-west-1`; Vercel functions are pinned to `fra1`. Signed DPAs/SCCs are the practical compliance mitigation; full jurisdictional sovereignty is documented as a future option.

---

## 2. Monorepo Layout

```text
pm-operator/
├── apps/
│   └── web/                       # Next.js 16 App Router community app
│       ├── app/
│       │   ├── (community)/       # authenticated community pages
│       │   ├── api/
│       │   │   ├── v1/            # REST route handlers
│       │   │   └── mcp/route.ts   # MCP entry point
│       │   ├── admin/             # moderation/admin pages
│       │   └── register/complete/page.tsx
│       ├── lib/
│       │   ├── auth/              # Supabase SSR client, middleware helpers
│       │   ├── db/                # local Drizzle client factory
│       │   ├── mcp/               # server factory, tools, resources, auth
│       │   └── services/          # domain services (posts, groups, points)
│       ├── middleware.ts
│       └── vercel.json
├── packages/
│   ├── ui/                        # Paper-v3 design system tokens/components
│   ├── db/                        # Drizzle schema, migrations, seeds, RLS SQL
│   ├── api/                       # shared Zod contracts + typed fetch client
│   └── mcp/                       # MCP server factory exported to apps/web
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Package responsibilities

| Package | Responsibility | Rules |
|---|---|---|
| `apps/web` | Pages, route handlers, middleware, admin UI | No direct `.env` reads outside server-only files; `runtime = 'nodejs'` on all DB-backed routes. |
| `packages/ui` | Paper-v3 tokens, primitives, TipTap editor shell | Framework-agnostic core; Next.js-specific wrappers live in `packages/ui/next`. |
| `packages/db` | Drizzle schema, generated migrations, seed scripts, RLS policy files | No Next.js imports; framework-agnostic. |
| `packages/api` | Zod request/response contracts and typed fetch client | No server-only secrets; can be imported by `packages/mcp` and `apps/web`. |
| `packages/mcp` | `createCommunityMcpServer` factory and tool/resource definitions | Imported by `apps/web/app/api/mcp/route.ts`; can be deployed standalone later. |

---

## 3. Tech Stack and Versions

| Layer | Technology | Version / Plan | Purpose |
|---|---|---|---|
| Monorepo / package manager | pnpm + Turborepo | pnpm 9.x, Turborepo 2.x | Workspaces, caching, pipeline tasks. |
| Framework | Next.js App Router | 16.x | Pages, route handlers, middleware. |
| Language | TypeScript | 5.7+ | Strict mode; shared `tsconfig` packages. |
| Styling | Tailwind CSS | 4.x | Paper-v3 tokens. |
| Components | Radix primitives | latest stable | Accessible primitives. |
| ORM / migrations | Drizzle ORM + Drizzle Kit | 0.36+ / 0.27+ | Type-safe schema and migrations. |
| Auth | Supabase Auth | `@supabase/ssr` 0.5+, `@supabase/supabase-js` 2.48+ | OAuth, email, sessions, JWT, RLS. |
| Database | Supabase Postgres | Pro, `eu-west-1` | Managed Postgres, backups, extensions, RLS. |
| Realtime | Supabase Realtime | Pro plan | Live posts/comments/notifications. |
| Storage | Supabase Storage | Pro plan | Avatars, attachments, signed URLs. |
| Cache / rate limit | Upstash Redis | Free tier via Vercel Marketplace | Rate limits, short-lived cache. |
| Email | Loops | Free tier (1,000 contacts / 4,000 sends/mo) | Transactional + lifecycle email. |
| Hosting | Vercel Pro | `fra1` region | Serverless functions, CDN, preview deploys. |
| Agent protocol | MCP SDK v2 alpha | `@modelcontextprotocol/sdk` v2 alpha (pinned) | `/api/mcp` Streamable HTTP handler. |
| Observability | Sentry + Vercel Analytics + structured logs | Existing Sentry dependency in Paper-v3 | Error tracking, web analytics, audit logs. |

### Upgrade triggers

- Supabase DB > 400 MB or compute saturation → larger compute.
- Realtime peak connections > 150 or messages > 4M/month → monitor and tune channels.
- Upstash commands > 400K/month or bandwidth > 8 GB → paid tier.
- Loops contacts > 1,000 or sends > 4,000/month → Starter plan.

---

## 4. Data Model

### 4.1 Drizzle schema (`packages/db/src/schema.ts`)

```typescript
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  numeric,
  date,
  index,
  unique,
  foreignKey,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['member', 'moderator', 'admin']);
export const groupVisibilityEnum = pgEnum('group_visibility', ['public', 'invite_only', 'paid']);
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'cancelled', 'past_due', 'expired']);
export const tierIntervalEnum = pgEnum('tier_interval', ['month', 'year', 'one_time']);
export const postTypeEnum = pgEnum('post_type', [
  'discussion',
  'question',
  'build',
  'lesson', // admin-only: pinned canonical resources in circles
]);
export const postStatusEnum = pgEnum('post_status', ['published', 'draft', 'flagged', 'hidden', 'deleted']);
export const commentStatusEnum = pgEnum('comment_status', ['published', 'hidden', 'deleted']);
export const reactionTypeEnum = pgEnum('reaction_type', ['like', 'celebrate']);
export const targetTypeEnum = pgEnum('target_type', ['post', 'comment']);
export const pointEventTypeEnum = pgEnum('point_event_type', [
  'topic_created',
  'comment_created',
  'solution_accepted',
  'like_received',
  'like_given',
  'invite_accepted',
  'daily_visit',
  'posts_read',
]);
export const leaderboardPeriodEnum = pgEnum('leaderboard_period', [
  'all_time',
  'quarterly',
  'monthly', // reserved for future use; launch only populates 'all_time'
  'weekly',
]);
export const inviteRoleEnum = pgEnum('invite_role', ['member', 'moderator', 'admin']);
export const flagStatusEnum = pgEnum('flag_status', ['open', 'resolved', 'dismissed']);
export const notificationTypeEnum = pgEnum('notification_type', ['comment', 'reaction', 'solution', 'invite', 'flag', 'flag_resolved', 'mention']);
export const dailyStatTypeEnum = pgEnum('daily_stat_type', ['posts_read', 'likes_given']);

// Sentinel UUID used for global leaderboard rows in user_scores.
// Migration 0001_triggers.sql seeds a matching groups row so the FK is satisfied.
export const GLOBAL_GROUP_ID = '00000000-0000-0000-0000-000000000000';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    emailConfirmed: boolean('email_confirmed').default(false).notNull(),
    username: text('username').notNull().unique(),
    userslug: text('userslug').notNull().unique(),
    fullName: text('full_name'),
    pictureUrl: text('picture_url'),
    aboutMe: text('about_me'),
    linkedinId: text('linkedin_id').unique(),
    githubId: text('github_id').unique(),
    googleId: text('google_id').unique(),
    painfulToolStackTask: text('painful_tool_stack_task').notNull().default(''),
    role: userRoleEnum('role').default('member').notNull(),
    reputationScore: numeric('reputation_score', { precision: 12, scale: 2 }).default('0').notNull(),
    streakDays: integer('streak_days').default(0).notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    preferences: jsonb('preferences').default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roleIdx: index('users_role_idx').on(table.role),
    lowerUsernameIdx: unique('users_lower_username_idx').on(sql`lower(${table.username})`),
    lowerUserslugIdx: unique('users_lower_userslug_idx').on(sql`lower(${table.userslug})`),
  })
);

export const membershipTiers = pgTable('membership_tiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }),
  currency: text('currency').default('EUR').notNull(),
  interval: tierIntervalEnum('interval').default('month').notNull(),
  features: jsonb('features').default(sql`'[]'::jsonb`).notNull(),
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userMemberships = pgTable(
  'user_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tierId: uuid('tier_id')
      .notNull()
      .references(() => membershipTiers.id, { onDelete: 'set null' }),
    status: membershipStatusEnum('status').default('active').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserTier: unique('user_memberships_user_tier_idx').on(table.userId, table.tierId),
  })
);

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    visibility: groupVisibilityEnum('visibility').default('public').notNull(),
    requiredTierId: uuid('required_tier_id').references(() => membershipTiers.id, { onDelete: 'set null' }),
    memberCount: integer('member_count').default(0).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    visibilityCreatedIdx: index('groups_visibility_created_idx').on(table.visibility, table.createdAt),
  })
);

export const groupMemberships = pgTable(
  'group_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').default('member').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueGroupUser: unique('group_memberships_group_user_idx').on(table.groupId, table.userId),
    userRoleIdx: index('group_memberships_user_role_idx').on(table.userId, table.role),
  })
);

export const groupInvites = pgTable(
  'group_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    inviterId: uuid('inviter_id').references(() => users.id, { onDelete: 'set null' }),
    maxUses: integer('max_uses').default(1).notNull(),
    usedCount: integer('used_count').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    role: inviteRoleEnum('role').default('member').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // code is already indexed by the unique constraint above.
    inviterIdx: index('group_invites_inviter_idx').on(table.inviterId),
  })
);

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    content: text('content').notNull(), // sanitized HTML from TipTap
    contentPlain: text('content_plain').notNull(),
    type: postTypeEnum('type').default('discussion').notNull(),
    status: postStatusEnum('status').default('published').notNull(),
    tags: text('tags').array().default(sql`ARRAY[]::text[]`).notNull(),
    upvotes: integer('upvotes').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    // Solved state is derived from accepted_comment_id IS NOT NULL.
    acceptedCommentId: uuid('accepted_comment_id').references(() => comments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupStatusCreatedIdx: index('posts_group_status_created_idx').on(table.groupId, table.status, table.createdAt),
    typeIdx: index('posts_type_idx').on(table.type),
    statusIdx: index('posts_status_idx').on(table.status),
    tagsGinIdx: index('posts_tags_gin_idx').on(table.tags).using('gin'),
    // 'simple' dictionary supports multilingual EU content at launch; no English-only stemming.
    contentFtsIdx: index('posts_content_fts_idx')
      .on(sql`to_tsvector('simple', ${table.contentPlain})`)
      .using('gin'),
    contentTrgmIdx: index('posts_content_trgm_idx')
      .on(sql`lower(${table.contentPlain})`)
      .using('gin', sql`gin_trgm_ops`),
  })
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    parentCommentId: uuid('parent_comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    content: text('content').notNull(), // sanitized HTML from TipTap
    contentPlain: text('content_plain').notNull(), // extracted plain text for search / summaries
    upvotes: integer('upvotes').default(0).notNull(),
    status: commentStatusEnum('status').default('published').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    postCreatedIdx: index('comments_post_created_idx').on(table.postId, table.createdAt),
    postParentCreatedIdx: index('comments_post_parent_created_idx').on(table.postId, table.parentCommentId, table.createdAt),
  })
);

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: targetTypeEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reactionType: reactionTypeEnum('reaction_type').default('like').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserTarget: unique('reactions_user_target_idx').on(table.userId, table.targetType, table.targetId),
    targetIdx: index('reactions_target_idx').on(table.targetType, table.targetId),
  })
);

export const postViews = pgTable(
  'post_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    viewerIp: text('viewer_ip'),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index('post_views_post_idx').on(table.postId),
    uniqueUserPost: unique('post_views_user_post_idx').on(table.postId, table.userId),
  })
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: notificationTypeEnum('type').notNull(),
    payload: jsonb('payload').default(sql`'{}'::jsonb`).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index('notifications_user_created_idx').on(table.userId, table.createdAt),
  })
);

export const pointEvents = pgTable(
  'point_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: pointEventTypeEnum('event_type').notNull(),
    points: numeric('points', { precision: 10, scale: 2 }).notNull(),
    sourceId: uuid('source_id'), // post_id / comment_id / invite_id depending on event
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    context: jsonb('context').default(sql`'{}'::jsonb`).notNull(),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userAwardedIdx: index('point_events_user_awarded_idx').on(table.userId, table.awardedAt),
    eventAwardedIdx: index('point_events_event_awarded_idx').on(table.eventType, table.awardedAt),
    uniqueSourceEvent: unique('point_events_source_event_idx').on(table.userId, table.eventType, table.sourceId),
    uniqueDailyVisit: unique('point_events_daily_visit_idx')
      .on(table.userId, sql`${table.awardedAt}::date`)
      .where(sql`${table.eventType} = 'daily_visit'`),
  })
);

export const userScores = pgTable(
  'user_scores',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull().default(GLOBAL_GROUP_ID),
    period: leaderboardPeriodEnum('period').notNull(),
    score: numeric('score', { precision: 12, scale: 2 }).default('0').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: unique('user_scores_pk').on(table.userId, table.groupId, table.period),
    scoreIdx: index('user_scores_score_idx').on(table.groupId, table.period, table.score),
  })
);

export const userDailyStats = pgTable(
  'user_daily_stats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    statType: dailyStatTypeEnum('stat_type').notNull(),
    count: integer('count').default(0).notNull(),
    pointsEarned: numeric('points_earned', { precision: 10, scale: 2 }).default('0').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserDateType: unique('user_daily_stats_user_date_type_idx').on(table.userId, table.date, table.statType),
  })
);

export const badges = pgTable('badges', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  criteria: jsonb('criteria').default(sql`'{}'::jsonb`).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userBadges = pgTable(
  'user_badges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).defaultNow().notNull(),
    awardedBy: uuid('awarded_by').references(() => users.id, { onDelete: 'set null' }),
    context: jsonb('context').default(sql`'{}'::jsonb`).notNull(),
  },
  (table) => ({
    uniqueUserBadge: unique('user_badges_user_badge_idx').on(table.userId, table.badgeId),
  })
);

export const flags = pgTable(
  'flags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    targetType: targetTypeEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    autoFlagged: boolean('auto_flagged').default(false).notNull(),
    status: flagStatusEnum('status').default('open').notNull(),
    resolverId: uuid('resolver_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    targetStatusIdx: index('flags_target_status_idx').on(table.targetType, table.targetId, table.status),
  })
);

export const watchedPhrases = pgTable('watched_phrases', {
  id: uuid('id').defaultRandom().primaryKey(),
  phrase: text('phrase').notNull().unique(),
  sanctionedFraming: text('sanctioned_framing'), // suggested alternative phrasing shown to users when content is auto-flagged
  isRegex: boolean('is_regex').default(false).notNull(),
  autoFlag: boolean('auto_flag').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentActions = pgTable(
  'agent_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: text('client_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    toolName: text('tool_name').notNull(),
    input: jsonb('input').default(sql`'{}'::jsonb`).notNull(),
    output: jsonb('output').default(sql`'{}'::jsonb`).notNull(),
    error: text('error'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    clientCreatedIdx: index('agent_actions_client_created_idx').on(table.clientId, table.createdAt),
  })
);

export const mcpClients = pgTable(
  'mcp_clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: text('client_id').notNull().unique(),
    name: text('name').notNull(),
    scopes: text('scopes').array().notNull(), // e.g. ['community:read']
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  }
);
```

### 4.2 Foreign-key integrity and triggers (`packages/db/migrations/0001_triggers.sql`)

```sql
-- Ensure accepted_comment_id belongs to the same post.
CREATE OR REPLACE FUNCTION enforce_accepted_comment_post()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.accepted_comment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM comments WHERE id = NEW.accepted_comment_id AND post_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'accepted_comment_id must reference a comment on the same post';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_accepted_comment_post ON posts;
CREATE TRIGGER trg_enforce_accepted_comment_post
BEFORE UPDATE OF accepted_comment_id ON posts
FOR EACH ROW EXECUTE FUNCTION enforce_accepted_comment_post();

-- Maintain posts.upvotes / comments.upvotes from reactions.
CREATE OR REPLACE FUNCTION update_reaction_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE posts SET upvotes = upvotes + 1 WHERE id = NEW.target_id;
    ELSIF NEW.target_type = 'comment' THEN
      UPDATE comments SET upvotes = upvotes + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE posts SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.target_id;
    ELSIF OLD.target_type = 'comment' THEN
      UPDATE comments SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reaction_counters ON reactions;
CREATE TRIGGER trg_reaction_counters
AFTER INSERT OR DELETE ON reactions
FOR EACH ROW EXECUTE FUNCTION update_reaction_counters();

-- Maintain posts.comment_count from comments (soft-delete aware).
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'published' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'published' AND NEW.status <> 'published' THEN
      UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF OLD.status <> 'published' AND NEW.status = 'published' THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_count ON comments;
CREATE TRIGGER trg_comment_count
AFTER INSERT OR UPDATE OF status OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- Maintain groups.member_count.
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_group_member_count ON group_memberships;
CREATE TRIGGER trg_group_member_count
AFTER INSERT OR DELETE ON group_memberships
FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

-- Apply points to users.reputation_score and user_scores summary table.
CREATE OR REPLACE FUNCTION apply_point_event()
RETURNS TRIGGER AS $$
DECLARE
  global_group_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  UPDATE users
  SET reputation_score = reputation_score + NEW.points
  WHERE id = NEW.user_id;

  INSERT INTO user_scores (user_id, group_id, period, score, updated_at)
  VALUES (NEW.user_id, COALESCE(NEW.group_id, global_group_id), 'all_time', NEW.points, now())
  ON CONFLICT (user_id, group_id, period)
  DO UPDATE SET
    score = user_scores.score + EXCLUDED.points,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_point_event ON point_events;
CREATE TRIGGER trg_apply_point_event
AFTER INSERT ON point_events
FOR EACH ROW EXECUTE FUNCTION apply_point_event();

-- Sentinel group for global leaderboard scores (matches GLOBAL_GROUP_ID).
INSERT INTO groups (id, slug, name, description, visibility, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'global',
  'Global',
  'Sentinel group for global leaderboard scores. Not a real circle.',
  'public',
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- pg_trgm for similarity search; create before trigram indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Realtime publication.
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE posts, comments, notifications;
```

### 4.3 Row-Level Security policies (`packages/db/migrations/0002_rls.sql`)

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE watched_phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

-- users: public profiles, self update only. Role elevation and admin mutations go through service-role functions.
CREATE POLICY users_select ON users FOR SELECT USING (true);
CREATE POLICY users_update ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- groups: public visible to everyone; non-public only to members/admins.
CREATE POLICY groups_select ON groups FOR SELECT USING (
  visibility = 'public'
  OR auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = groups.id AND user_id = auth.uid()
  )
);
CREATE POLICY groups_insert ON groups FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY groups_update ON groups FOR UPDATE USING (
  auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  OR EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = groups.id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
);

-- group_memberships: own + group admins.
CREATE POLICY gm_select ON group_memberships FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM group_memberships gm
    WHERE gm.group_id = group_memberships.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY gm_insert ON group_memberships FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY gm_delete ON group_memberships FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  OR EXISTS (
    SELECT 1 FROM group_memberships gm
    WHERE gm.group_id = group_memberships.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
);

-- group_invites: visible to inviter and group admins; accept uses service logic.
CREATE POLICY gi_select ON group_invites FOR SELECT USING (
  inviter_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM group_memberships gm
    WHERE gm.group_id = group_invites.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY gi_insert ON group_invites FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = group_invites.group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- membership_tiers: readable by all, writable only by admin.
CREATE POLICY mt_select ON membership_tiers FOR SELECT USING (true);
CREATE POLICY mt_write ON membership_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- user_memberships: own + admin.
CREATE POLICY um_select ON user_memberships FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- posts: read if group public or member/author/admin; write if member/admin.
CREATE POLICY posts_select ON posts FOR SELECT USING (
  status <> 'deleted'
  AND (
    EXISTS (SELECT 1 FROM groups WHERE id = posts.group_id AND visibility = 'public')
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM group_memberships
      WHERE group_id = posts.group_id AND user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
);
CREATE POLICY posts_insert ON posts FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = posts.group_id AND user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY posts_update ON posts FOR UPDATE USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = posts.group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
);

-- comments: same visibility as parent post, write if member/admin.
CREATE POLICY comments_select ON comments FOR SELECT USING (
  status <> 'deleted'
  AND EXISTS (
    SELECT 1 FROM posts p
    JOIN groups g ON g.id = p.group_id
    WHERE p.id = comments.post_id
      AND p.status <> 'deleted'
      AND (
        g.visibility = 'public'
        OR auth.uid() = comments.author_id
        OR EXISTS (
          SELECT 1 FROM group_memberships
          WHERE group_id = g.id AND user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
      )
  )
);
CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = (SELECT group_id FROM posts WHERE id = comments.post_id)
      AND user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY comments_update ON comments FOR UPDATE USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- reactions: insert/delete own only. Select respects parent group visibility.
CREATE POLICY reactions_select ON reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM posts p
    JOIN groups g ON g.id = p.group_id
    WHERE p.id = reactions.target_id AND reactions.target_type = 'post'
      AND (g.visibility = 'public'
        OR auth.uid() = p.author_id
        OR EXISTS (SELECT 1 FROM group_memberships WHERE group_id = g.id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  )
  OR EXISTS (
    SELECT 1 FROM comments c
    JOIN posts p ON p.id = c.post_id
    JOIN groups g ON g.id = p.group_id
    WHERE c.id = reactions.target_id AND reactions.target_type = 'comment'
      AND (g.visibility = 'public'
        OR auth.uid() = c.author_id
        OR EXISTS (SELECT 1 FROM group_memberships WHERE group_id = g.id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  )
);
CREATE POLICY reactions_insert ON reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY reactions_delete ON reactions FOR DELETE USING (user_id = auth.uid());

-- notifications: own only.
CREATE POLICY notifications_select ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (user_id = auth.uid());

-- point_events: own + admin.
CREATE POLICY pe_select ON point_events FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- user_scores: public read (leaderboards), no client writes.
CREATE POLICY us_select ON user_scores FOR SELECT USING (true);

-- user_daily_stats: own + admin.
CREATE POLICY uds_select ON user_daily_stats FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- flags: read by moderators/admins, insert by authenticated users.
CREATE POLICY flags_select ON flags FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY flags_insert ON flags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY flags_update ON flags FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- watched_phrases: admin/moderator only.
CREATE POLICY wp_select ON watched_phrases FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY wp_write ON watched_phrases FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- badges / user_badges: public read; admin writes.
CREATE POLICY badges_select ON badges FOR SELECT USING (true);
CREATE POLICY user_badges_select ON user_badges FOR SELECT USING (true);
CREATE POLICY user_badges_write ON user_badges FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- agent_actions / mcp_clients: admin only.
CREATE POLICY aa_select ON agent_actions FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY mc_select ON mcp_clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- post_views: anonymous/authenticated inserts allowed; reads restricted to admins.
CREATE POLICY post_views_insert ON post_views FOR INSERT WITH CHECK (true);
CREATE POLICY post_views_select ON post_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
```

### 4.4 Indexes and constraints summary

| Table | Key index / constraint | Purpose |
|---|---|---|
| `users` | `lower(username)`, `lower(userslug)` unique | Case-insensitive login and URL lookups. |
| `groups` | `(visibility, created_at)` | Public/private group lists and feed filtering. |
| `group_memberships` | `(user_id, role)`, unique `(group_id, user_id)` | "My groups" and duplicate prevention. |
| `posts` | `(group_id, status, created_at)`, GIN `tags`, GIN `to_tsvector('simple', content_plain)`, GIN trigram `content_plain`, `(type)`, `(status)` | Feed, tag filtering, multilingual full-text + similarity search. |
| `comments` | `(post_id, created_at)`, `(post_id, parent_comment_id, created_at)` | Thread ordering. |
| `reactions` | unique `(user_id, target_type, target_id)`, `(target_type, target_id)` | Duplicate prevention and count lookups. |
| `point_events` | `(user_id, awarded_at)`, `(event_type, awarded_at)`, unique source event, unique daily visit partial | Leaderboards, idempotency, daily caps. |
| `flags` | `(target_type, target_id, status)` | Moderation queue. |
| `group_invites` | unique `code`, `(inviter_id)` | Invite lookup and acceptance. |
| `post_views` | unique `(post_id, user_id)` | Deduplicate authenticated views. |
| `user_scores` | unique PK `(user_id, group_id, period)`, `(group_id, period, score)` | Leaderboard reads and writes. |
| `user_daily_stats` | unique `(user_id, date, stat_type)` | Daily cap atomicity. |

### 4.5 JSONB column shapes

These columns store structured data. Shapes are enforced at the application/Zod layer; Postgres stores them as JSONB.

| Column | Example shape | Notes |
|---|---|---|
| `users.preferences` | `{ emailNotifications: true, weeklyDigest: true, reducedMotion: false }` | Frontend settings only. |
| `badges.criteria` | `{ eventType: 'solution_accepted', threshold: 10 }` | Defines how the badge is earned. |
| `user_badges.context` | `{ postId: 'uuid', reason: 'manual award' }` | Source/context of the award. |
| `notifications.payload` | `{ postId: 'uuid', commentId: 'uuid', actorSlug: 'alexrios' }` | Event-specific metadata; always includes IDs the frontend needs to link. |
| `point_events.context` | `{ postId: 'uuid', reason: 'manual adjustment', actorId: 'uuid' }` | Source and audit info for the point award. |
| `membership_tiers.features` | `["access-design-partners", "office-hours"]` | Capability flags for future paid gating. |
| `agent_actions.input` / `output` | `{ tool: 'search_posts', args: { q: 'MCP auth' } }` / `{ results: [...] }` | Audit log for MCP-mediated calls. |

### 4.6 Implementation notes

- `posts.viewCount` is updated by a periodic async job (e.g., a 5-minute Vercel cron or Supabase cron endpoint) that aggregates `post_views` grouped by `post_id`. It is **not** updated in the request path, so view logging never blocks rendering.
- `membership_tiers.price` is nullable intentionally: a free tier has no price, while paid tiers will have a price when enabled in Phase 3.
- `daily_visit` and `posts_read` idempotency is enforced by a partial unique index on `point_events` and atomic `user_daily_stats` inserts with a `count < cap` guard. No other event type is emitted with a null `source_id`.

---

## 5. API Contracts

All REST routes are under `/api/v1/*`. The UI authenticates via Supabase cookie session; programmatic clients may send the same session JWT as a `Authorization: Bearer <jwt>` header.

### 5.1 Standard response envelope and errors

```json
// Success (HTTP 200)
{
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "hasMore": false }
}

// Error (HTTP 400/401/403/404/409/429/500)
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Retry after 60 seconds.",
    "field": null
  }
}
```

Common error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `ONBOARDING_INCOMPLETE`, `INTERNAL_ERROR`.

### 5.2 Endpoints

#### Auth / current user

```http
GET /api/v1/me
Authorization: Bearer <supabase-jwt>
```

```json
{
  "data": {
    "id": "uuid",
    "email": "alex@example.com",
    "username": "alexrios",
    "userslug": "alexrios",
    "fullName": "Alex Ríos",
    "pictureUrl": "https://...",
    "role": "member",
    "reputationScore": 124,
    "streakDays": 5,
    "painfulToolStackTask": "...",
    "onboardingComplete": true
  }
}
```

```http
PATCH /api/v1/me
{
  "fullName": "Alex Ríos",
  "aboutMe": "AI operator...",
  "pictureUrl": "https://...",
  "preferences": { "newsletter": true }
}
```

#### Onboarding

```http
POST /api/v1/onboarding
{
  "painfulToolStackTask": "The hardest thing I deal with is evals for multi-agent orchestration."
}
```

Response: updated user. All write endpoints return `ONBOARDING_INCOMPLETE` if the field is empty.

#### Feed

```http
GET /api/v1/feed?group_slug=show-your-build&filter=unanswered&sort=top&page=1&limit=20
```

Query parameters:

| Param | Values | Default |
|---|---|---|
| `group_slug` | any group slug | none (all accessible groups) |
| `filter` | `all`, `my-circles`, `questions`, `solutions`, `unanswered`, `builds` | `all` |
| `sort` | `new`, `top`, `trending` | `new` |
| `page` | integer | 1 |
| `limit` | 1-50 | 20 |

```json
{
  "data": {
    "posts": [
      {
        "id": "post-uuid",
        "title": "How we cut eval cost by 60%",
        "type": "question",
        "status": "published",
        "isSolved": true,
        "group": { "slug": "cost-optimization", "name": "Cost Optimization" },
        "author": { "userslug": "alexrios", "username": "Alex Ríos", "reputationScore": 124, "acceptedSolutions": 12 },
        "upvotes": 34,
        "commentCount": 8,
        "viewCount": 412,
        "tags": ["evals", "cost"],
        "createdAt": "2026-07-28T09:12:00Z"
      }
    ],
    "nextCursor": "2026-07-28T09:00:00Z"
  },
  "meta": { "page": 1, "limit": 20, "hasMore": true }
}
```

#### Posts

```http
POST /api/v1/posts
{
  "groupSlug": "show-your-build",
  "title": "Open-source MCP router we shipped",
  "content": "<p>...sanitized HTML...</p>",
  "type": "build",
  "tags": ["mcp", "router"]
}
```

```http
GET /api/v1/posts/:id
PATCH /api/v1/posts/:id
DELETE /api/v1/posts/:id   # soft delete; sets status = deleted
POST /api/v1/posts/:id/accept-solution
{ "commentId": "comment-uuid" }
GET /api/v1/posts/:id/comments
```

#### Comments

```http
POST /api/v1/posts/:postId/comments
{
  "content": "<p>Have you tried...</p>",
  "parentCommentId": null
}

PATCH /api/v1/comments/:id
DELETE /api/v1/comments/:id
```

#### Reactions

```http
POST /api/v1/reactions
{
  "targetType": "post",
  "targetId": "post-uuid",
  "reactionType": "like"
}

DELETE /api/v1/reactions?targetType=post&targetId=post-uuid
```

#### Groups

```http
GET /api/v1/groups
GET /api/v1/groups/:slug
POST /api/v1/groups            # admin/moderator
{
  "slug": "mcp-servers",
  "name": "MCP Servers",
  "description": "...",
  "visibility": "public",
  "color": "#3b82f6"
}
POST /api/v1/groups/:slug/join           # public: auto-join; invite_only: requires code
{ "inviteCode": "OPTIONAL" }
DELETE /api/v1/groups/:slug/membership
GET /api/v1/groups/:slug/members
GET /api/v1/groups/:slug/leaderboard?period=quarterly
```

#### Invites

```http
POST /api/v1/invites
{
  "groupSlug": "design-partners",
  "role": "member",
  "maxUses": 5,
  "expiresAt": "2026-08-15T00:00:00Z"
}

GET /api/v1/invites/:code
POST /api/v1/invites/:code/accept
```

#### Users / profiles

```http
GET /api/v1/users/:slug
GET /api/v1/users/:slug/scores
GET /api/v1/users/:slug/badges
GET /api/v1/users/:slug/activity
```

#### Leaderboards

```http
GET /api/v1/leaderboards?type=operator-stack&groupSlug=&period=quarterly&page=1&limit=20
```

Types: `operator-stack`, `show-your-build`, `all-time`. Periods: `weekly`, `monthly`, `quarterly`, `all_time`.

```json
{
  "data": {
    "leaderboard": [
      { "rank": 1, "userslug": "alexrios", "username": "Alex Ríos", "score": 124, "acceptedSolutions": 12 }
    ]
  }
}
```

#### Search

```http
GET /api/v1/search?q=mcp+auth&groupSlug=&page=1&limit=20
```

Uses Postgres full-text search on `posts.content_plain` and `pg_trgm` similarity, boosted by accepted-solution status (`accepted_comment_id IS NOT NULL`) and author reputation.

#### Flags / moderation

```http
POST /api/v1/flags
{
  "targetType": "post",
  "targetId": "post-uuid",
  "reason": "Promotional content"
}

GET /api/v1/flags?status=open&page=1&limit=20       # moderator+
PATCH /api/v1/flags/:id/resolve
{
  "status": "resolved",
  "resolutionNote": "Removed spam"
}
```

#### Notifications

```http
GET /api/v1/notifications?limit=20&unreadOnly=true
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
```

---

## 6. MCP Server Specification

### 6.1 Deployment target

The MCP server is mounted as a Next.js App Router route at `apps/web/app/api/mcp/route.ts` using `createMcpHandler` from the pinned v2 alpha SDK. It is feature-flagged behind `MCP_ENABLED` and supports dual protocol-era negotiation so older clients can connect.

### 6.2 Route skeleton (`apps/web/app/api/mcp/route.ts`)

```typescript
import { createCommunityMcpServer } from '@pm-operator/mcp';
import { createMcpHandler } from '@modelcontextprotocol/sdk/server/streamable-http';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const handler = createMcpHandler({
  server: createCommunityMcpServer(),
  // Allow 2024-11-05 clients and 2025-03-26 / 2026-07-28 clients.
  supportedProtocolVersions: ['2026-07-28', '2025-03-26', '2024-11-05'],
  auth: {
    verify: async (req: NextRequest) => verifyMcpOAuthToken(req),
  },
});

export async function POST(req: NextRequest) {
  if (process.env.MCP_ENABLED !== 'true') {
    return new Response('MCP not enabled', { status: 404 });
  }
  return handler(req);
}

export async function GET(req: NextRequest) {
  if (process.env.MCP_ENABLED !== 'true') {
    return new Response('MCP not enabled', { status: 404 });
  }
  // GET is required for Streamable HTTP discovery / SSE fallback.
  return handler(req);
}
```

### 6.3 Authentication and scopes

The MCP server is an OAuth 2.0 Resource Server. Tokens are JWTs signed with `MCP_TOKEN_SECRET`, issued by an internal admin endpoint (or manually for launch). Each token contains:

```json
{
  "sub": "<client-id>",
  "scope": "community:read community:write",
  "iss": "operator.promptmetrics.dev",
  "aud": "operator.promptmetrics.dev/mcp",
  "exp": 1234567890
}
```

Scopes:

| Scope | Capability |
|---|---|
| `community:read` | Read public posts, profiles, groups, leaderboards, thread summaries. |
| `community:write` | Create posts/comments/reactions/invites as an attributed user. Requires a `user_slug` argument. |
| `community:moderate` | Create flags, list recent flags, suggest resolutions. |
| `community:admin` | Award points, grant badges, create groups, delete content. |
| `community:system` | Act on behalf of a user. Requires `on_behalf_of_user_slug` and logs both `clientId` and target `user_id`. |

Attribution rule: every MCP mutation records the OAuth `clientId` in `agent_actions` plus the target community `user_id`.

### 6.4 Tools

#### Read tools (enabled at launch)

```typescript
{
  name: 'search_posts',
  description: 'Search public community posts. Boosts solved posts and exact tag matches.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      group_slug: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      sort: { type: 'string', enum: ['relevance', 'new', 'top'] },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 }
    },
    required: ['query']
  }
}
```

```typescript
{
  name: 'get_user_profile',
  description: 'Return a public user profile, reputation, badges, and top circles.',
  inputSchema: {
    type: 'object',
    properties: {
      user_slug: { type: 'string' }
    },
    required: ['user_slug']
  }
}
```

```typescript
{
  name: 'list_leaderboards',
  description: 'Return a leaderboard. Use empty group_slug for global.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['operator-stack', 'show-your-build', 'all-time'] },
      group_slug: { type: 'string' },
      period: { type: 'string', enum: ['weekly', 'monthly', 'quarterly', 'all_time'] },
      page: { type: 'integer' },
      limit: { type: 'integer' }
    },
    required: ['type']
  }
}
```

```typescript
{
  name: 'summarize_thread',
  description: 'Summarize a post and its comments. Heavy tool; may return a job URI if >2s.',
  inputSchema: {
    type: 'object',
    properties: {
      post_id: { type: 'string', format: 'uuid' },
      max_length: { type: 'integer', default: 300 }
    },
    required: ['post_id']
  }
}
```

#### Write / admin tools (feature-flagged / post-launch)

```typescript
{
  name: 'create_post_reply',
  description: 'Create a comment on a post as a user.',
  inputSchema: {
    type: 'object',
    properties: {
      post_id: { type: 'string', format: 'uuid' },
      user_slug: { type: 'string' },
      content: { type: 'string' },
      on_behalf_of_user_slug: { type: 'string' }
    },
    required: ['post_id', 'user_slug', 'content']
  }
}

{
  name: 'create_invite',
  description: 'Create a group invite code.',
  inputSchema: {
    type: 'object',
    properties: {
      group_slug: { type: 'string' },
      role: { type: 'string', enum: ['member', 'moderator', 'admin'] },
      max_uses: { type: 'integer' },
      expires_at: { type: 'string', format: 'date-time' }
    },
    required: ['group_slug']
  }
}

{
  name: 'flag_post',
  description: 'Flag a post or comment for moderator review.',
  inputSchema: {
    type: 'object',
    properties: {
      target_type: { type: 'string', enum: ['post', 'comment', 'user'] },
      target_id: { type: 'string', format: 'uuid' },
      reason: { type: 'string' }
    },
    required: ['target_type', 'target_id', 'reason']
  }
}

{
  name: 'accept_solution',
  description: 'Mark a comment as the accepted solution.',
  inputSchema: {
    type: 'object',
    properties: {
      post_id: { type: 'string', format: 'uuid' },
      comment_id: { type: 'string', format: 'uuid' }
    },
    required: ['post_id', 'comment_id']
  }
}

{
  name: 'award_points',
  description: 'Admin only: manually award points to a user.',
  inputSchema: {
    type: 'object',
    properties: {
      user_slug: { type: 'string' },
      points: { type: 'number' },
      reason: { type: 'string' }
    },
    required: ['user_slug', 'points', 'reason']
  }
}

{
  name: 'grant_badge',
  description: 'Admin only: grant a badge to a user.',
  inputSchema: {
    type: 'object',
    properties: {
      user_slug: { type: 'string' },
      badge_slug: { type: 'string' }
    },
    required: ['user_slug', 'badge_slug']
  }
}
```

### 6.5 Resources and templates

Static resources:

```text
community://users/{slug}
community://groups/{slug}
community://posts/{id}
community://feed?group_slug={slug}&filter={filter}&sort={sort}&page={page}
community://leaderboards/{type}?group_slug={slug}&period={period}
```

Resource templates:

```text
community://threads/{post_id}/summary
community://users/{slug}/reputation-history
community://jobs/{job_id}
```

### 6.6 Audit

Every MCP tool invocation writes a row to `agent_actions` with `clientId`, `toolName`, `input`, `output`, `durationMs`, and `userId` when acting on behalf of a user. Read tools are sampled at 10%; write/admin tools are logged at 100%.

---

## 7. Auth and Authorization Flow

### 7.1 Supabase Auth

- Providers: GitHub, Google, LinkedIn. LinkedIn OAuth is the least battle-tested; validate in staging.
- Email/password is supported but not the primary path at launch.
- Sessions are cookie-based via `@supabase/ssr`.

### 7.2 Middleware (`apps/web/middleware.ts`)

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { ... } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res;

  const { data: profile } = await supabase
    .from('users')
    .select('painful_tool_stack_task')
    .eq('id', user.id)
    .single();

  const path = req.nextUrl.pathname;
  const onboardingIncomplete = !profile?.painful_tool_stack_task;

  if (onboardingIncomplete && !path.startsWith('/register/complete') && !path.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/register/complete', req.url));
  }

  return res;
}
```

Middleware only checks the onboarding field; it does not perform heavy group/membership lookups.

### 7.3 API authorization rules

- Every write route verifies the Supabase session and rejects `ONBOARDING_INCOMPLETE` if `painful_tool_stack_task` is empty.
- Route handlers use a server-side Drizzle client initialized with the Supabase service-role key. RLS is enforced by policy evaluation against `auth.uid()` when queries are run through the Supabase client; service-role bypasses RLS and is used only for cross-RLS reads (global leaderboards) and admin operations.
- Group visibility and paid-tier checks are performed in application service code before writes.

### 7.4 OAuth scopes and copy

Scopes requested from providers are the minimum public profile only:

- GitHub: no additional scopes (public profile, email).
- Google: `openid email profile`.
- LinkedIn: `openid profile email`.

Sign-in buttons use the copy "Continue with GitHub / Google / LinkedIn".

---

## 8. Realtime and Notifications

### 8.1 Realtime publication

```sql
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE posts, comments, notifications;
```

### 8.2 Channels

| Channel | Event | Subscribers |
|---|---|---|
| `group:{slug}:posts` | new post inserted | feed page for group |
| `post:{id}:comments` | new comment inserted | open post detail page |
| `user:{id}:notifications` | new notification row | notification bell / inbox |

### 8.3 Client pattern

```typescript
// apps/web/lib/realtime.ts
import { createBrowserClient } from '@supabase/ssr';

export function subscribeToGroupPosts(slug: string, onInsert: (post: PostRow) => void) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return supabase
    .channel(`group:${slug}:posts`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `group_id=eq.${slug}` }, onInsert)
    .subscribe();
}
```

Note: Realtime filters operate on raw column values; map `slug` to `group_id` before subscribing.

### 8.4 Notifications table

Notifications are generated server-side after insert events and are the source of truth. Realtime pushes are a convenience layer; clients rehydrate from the table on reconnect.

```sql
-- Illustrative reference only — the Drizzle schema in section 4.1 is authoritative.
CREATE TABLE notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  actor_id uuid references users(id) on delete set null,
  type notification_type not null,
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at);
```

### 8.5 Limits and caveats

- Supabase Pro includes 500 peak connections and 5M messages/month. At 10–50 active users this is ample.
- Realtime delivery is at-least-once. Clients deduplicate by `id`.
- No guaranteed ordering across channels. Comment threads re-sort by `created_at` after receiving events.
- Realtime inserts must not steal focus; use `aria-live="polite"` and batch announcements. Honor `prefers-reduced-motion`.

---

## 9. Gamification Engine

### 9.1 Point rules

| Event | Points | Idempotency |
|---|---|---|
| `topic_created` | 10 | unique `(user_id, event_type, source_id)` where `source_id = post_id` |
| `comment_created` | 5 | unique `(user_id, event_type, source_id)` where `source_id = comment_id` |
| `solution_accepted` | 25 | one per `post.accepted_comment_id`; awarded to comment author |
| `like_received` | 2 | enforced by `reactions` unique constraint; trigger awards on insert |
| `like_given` | 1 | enforced by `reactions` unique constraint; capped via `user_daily_stats` |
| `invite_accepted` | 5 | one per `group_invites.id`; awarded to inviter |
| `posts_read` | 0.5 | capped per UTC day via `user_daily_stats` |
| `daily_visit` | 0.5 | one per UTC day via partial unique index on `point_events` |
| `streak_bonus` | 2 | one per UTC day (partial unique index); only on days the streak advances via post/comment activity; bonus capped at 30 consecutive days |

> **2026-08-01 (SPEC_LOG "Community-portal redesign decisions"):** weights retuned to the displayed economy (10/5/25) — the previous 5/3/8 table is superseded; `streak_bonus` added per decision D2/D3. Historical `point_events` keep their original values (no backfill).

### 9.2 Atomic point award service

```typescript
// packages/db/src/points.ts
export async function awardPoints(
  db: DbClient,
  {
    userId,
    eventType,
    points,
    sourceId,
    groupId,
    context,
  }: AwardPointsInput
) {
  return db.transaction(async (tx) => {
    await tx.insert(pointEvents).values({
      userId,
      eventType,
      points,
      sourceId,
      groupId,
      context,
    });
    const [updated] = await tx
      .update(users)
      .set({ reputationScore: sql`${users.reputationScore} + ${points}` })
      .where(eq(users.id, userId))
      .returning({ reputationScore: users.reputationScore });
    return updated.reputationScore;
  });
}
```

The database trigger `trg_apply_point_event` keeps `user_scores` in sync, so the transaction only needs to update `users.reputation_score`.

### 9.3 Daily caps (`user_daily_stats`)

```typescript
export async function trackDailyStat(
  db: DbClient,
  userId: string,
  statType: DailyStatType,
  cap: number,
  pointsPerAction: number
) {
  const today = new Date().toISOString().split('T')[0];
  const result = await db.execute(sql`
    INSERT INTO user_daily_stats (user_id, date, stat_type, count, points_earned)
    VALUES (${userId}, ${today}, ${statType}, 1, ${pointsPerAction})
    ON CONFLICT (user_id, date, stat_type)
    DO UPDATE SET
      count = GREATEST(user_daily_stats.count + 1, user_daily_stats.count),
      points_earned = LEAST(
        user_daily_stats.points_earned + ${pointsPerAction},
        ${cap}
      )
    WHERE user_daily_stats.count < ${cap}
    RETURNING count, points_earned
  `);
  return result.rows[0];
}
```

### 9.4 Idempotency matrix

| Event | Mechanism |
|---|---|
| `topic_created` | `UNIQUE (user_id, event_type, source_id)` |
| `comment_created` | `UNIQUE (user_id, event_type, source_id)` |
| `solution_accepted` | one per post; trigger checks `accepted_comment_id` |
| `like_received` / `like_given` | `reactions` unique constraint |
| `invite_accepted` | `group_invites.used_count < max_uses` |
| `daily_visit` | partial unique `(user_id, awarded_at::date) WHERE event_type = 'daily_visit'` |
| `posts_read` | `user_daily_stats` atomic insert-on-conflict with cap guard |

### 9.5 Leaderboards

`user_scores` is maintained by the `apply_point_event` trigger. Leaderboard reads are simple indexed sorts:

```sql
SELECT
  rank() OVER (ORDER BY score DESC) as rank,
  u.userslug,
  u.username,
  us.score
FROM user_scores us
JOIN users u ON u.id = us.user_id
WHERE us.group_id = :group_id_or_global
  AND us.period = :period
ORDER BY us.score DESC
LIMIT 20 OFFSET :offset;
```

### 9.6 Badges

Badges are seeded at launch:

| Slug | Name | Criteria |
|---|---|---|
| `first-build` | First Build | First `build` post in the Show Your Build circle. |
| `gatekeeper` | Gatekeeper | 3+ accepted solutions. |
| `open-registry-contributor` | Open Registry Contributor | First `lesson` post in the Skill Registry circle. |

Badge grants are checked nightly or triggered on `point_events`. They write to `user_badges` and are idempotent via `UNIQUE (user_id, badge_id)`.

---

## 10. Security Model

### 10.1 Row-Level Security

- RLS is enabled on every table.
- Public read is allowed only where the product explicitly requires it (`users` public profiles, `groups` public circles, `user_scores` leaderboards, `badges`).
- Service-role key bypasses RLS and is used only for: global leaderboards, cross-user analytics, cron/background jobs, and MCP cross-RLS operations.
- All service-role queries are code-reviewed and logged in `agent_actions` when invoked by MCP.

### 10.2 Input sanitization

- TipTap HTML is sanitized with `xss` / DOMPurify before storage. A separate `content_plain` field is extracted for search and summaries.
- `tags` are normalized to lowercase and trimmed; max 8 tags per post.
- Watched phrases are scanned against `content_plain` only; matches create a `flags` row. No content is auto-rejected.

### 10.3 Rate limiting

Use Upstash Redis with `@upstash/ratelimit`. Apply to public endpoints and `/api/mcp` before any DB work.

```typescript
// apps/web/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const publicLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(30, '1 m'),
  analytics: true,
});

export const mcpLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(100, '1 m'),
  analytics: true,
});

export const writeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 m'),
  analytics: true,
});
```

### 10.4 Service-role key handling

- Stored as `SUPABASE_SERVICE_ROLE_KEY` in Vercel environment variables.
- Marked server-only (`server-only` import or `process.env` reads only in server files).
- Never accepted from clients.
- Every service-role query is reviewed in pull requests.
- Admin routes under `/api/v1/admin/*` and `/api/mcp` are rate-limited and require additional role checks.

### 10.5 Onboarding enforcement

- Middleware redirects authenticated users missing `painful_tool_stack_task` to `/register/complete`.
- All write API routes reject requests with `ONBOARDING_INCOMPLETE` if the field is empty.
- The onboarding page is the only post-auth destination until the field is set.

---

## 11. Infrastructure and Deployment

### 11.1 Production services

| Service | Plan / Region | Purpose |
|---|---|---|
| Supabase | Pro, `eu-west-1` | Postgres, Auth, Realtime, Storage. |
| Vercel | Pro, `fra1` | Next.js hosting, CDN, previews. |
| Upstash Redis | Free via Vercel Marketplace | Rate limits, short cache. |
| Loops | Free | Transactional and lifecycle email. |
| DNS | Cloudflare or existing registrar | `operator.promptmetrics.dev` CNAME to Vercel. |

### 11.2 `vercel.json`

```json
{
  "regions": ["fra1"],
  "functions": {
    "app/api/v1/**/*.ts": {
      "maxDuration": 30
    },
    "app/api/mcp/route.ts": {
      "maxDuration": 300
    }
  }
}
```

### 11.3 Required environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<server-only>

# Auth / OAuth
NEXT_PUBLIC_OAUTH_GITHUB_ENABLED=true
NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=true
NEXT_PUBLIC_OAUTH_LINKEDIN_ENABLED=true

# MCP
MCP_ENABLED=true
MCP_TOKEN_SECRET=<server-only>

# Upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Loops
LOOPS_API_KEY=<server-only>
LOOPS_TRANSACTIONAL_QUEUE_ID=...

# Optional: summarization for summarize_thread
OPENAI_API_KEY=<server-only>
# or ANTHROPIC_API_KEY=...
```

### 11.4 Deployment sequence

1. Create Supabase project in `eu-west-1`; sign DPA.
2. Configure OAuth providers and branded email templates.
3. Push Drizzle migrations and seed groups/badges/watched phrases.
4. Create Vercel project, set env vars, pin `fra1`.
5. Deploy preview; run smoke tests.
6. Create preview domain `operator-v2.promptmetrics.dev` for internal testing.
7. Switch DNS for `operator.promptmetrics.dev` after RLS/MCP/security gates pass.
8. Decommission NodeBB VPS after 48 hours of stable traffic.

### 11.5 Compliance checklist

1. Supabase Pro upgrade signed + DPA.
2. Vercel DPA/SCCs signed if required.
3. RLS enabled on every table; policies reviewed.
4. PITR/backups enabled (can be deferred; document decision).
5. OAuth provider data-processing terms in privacy policy.
6. GDPR erasure request runbook documented.
7. Cookie consent for analytics/third-party embeds.
8. Egress and usage alerts configured.

---

## 12. Migration Plan from NodeBB

Current state: NodeBB is live with only test accounts. No production data exists.

1. **Keep NodeBB running** on the existing VPS as a placeholder while the new app is built.
2. **Build the new app** in `pm-operator` and deploy to `operator-v2.promptmetrics.dev`.
3. **Seed content** with 20–30 canonical posts across public circles and one private design-partners circle.
4. **Validate** SSO, onboarding, feed, leaderboards, flags, MCP read tools.
5. **Switch DNS** from the VPS to Vercel for `operator.promptmetrics.dev`.
6. **Monitor** for 48 hours; keep the VPS on standby during the cutover window.
7. **Decommission** the NodeBB VPS only after explicit confirmation.

No database migration is required. Test accounts may be recreated manually or left behind.

---

## 13. Testing Strategy

| Layer | Tool / approach | What to cover |
|---|---|---|
| Unit | Vitest | Gamification math, point caps, Zod contracts, watched-phrase matching. |
| DB / RLS | Supabase test helpers + pgTAP | Every visibility × membership × role × auth combination. |
| Integration | Vitest + local Supabase | Auth flow, onboarding enforcement, post/comment/reaction CRUD, feed filters. |
| Load | k6 or Artillery | 100 concurrent likes/comments; verify zero duplicate points and no counter drift. |
| E2E | Playwright | OAuth sign-up → onboarding → create post → accept solution → view leaderboard. |
| MCP contract | custom test harness | Verify each tool schema, scope enforcement, attribution logging, P95 < 2s. |
| Accessibility | axe-core in Playwright | WCAG 2.1 AA keyboard-only flow. |

### Critical test cases

1. Public group posts are readable anonymously; private/paid group posts leak to no one.
2. Concurrent `reactions` inserts produce exactly one `point_events` row and correct counters.
3. `daily_visit` and `posts_read` caps are enforced race-safely.
4. `accepted_comment_id` must reference a comment on the same post.
5. MCP write tools reject missing `user_slug` or insufficient scope.
6. Service-role key is never exposed in client bundles or logs.

---

## 14. Monitoring and Observability

### 14.1 Metrics

| Metric | Source | Alert threshold |
|---|---|---|
| Error rate | Sentry + Vercel logs | > 1% of requests |
| P95 API latency | Vercel Analytics / custom | > 1.5s for `/api/v1/*` |
| P95 MCP latency | `agent_actions.durationMs` | > 2s for read tools |
| Rate-limit hits | Upstash analytics | > 10/min |
| Realtime connections | Supabase dashboard | > 150 peak |
| DB CPU / storage | Supabase dashboard | > 70% CPU or > 400 MB storage |
| New flags / resolution time | `/admin/flags` | > 24h average |

### 14.2 Logging

- Use `pino` for structured logs in route handlers and services.
- Never log PII, secrets, or full JWTs.
- MCP read tools sampled 10%; write/admin tools logged 100% to `agent_actions`.

### 14.3 Alerting

- Sentry alerts for unhandled exceptions.
- Vercel alerting for function errors and high latency.
- Supabase alerting for compute/storage/realtime quotas.

### 14.4 Dashboards

- Vercel Analytics for web vitals and traffic.
- Supabase dashboard for DB/Realtime/Auth health.
- Custom `/admin/health` page with daily active users, post volume, flag queue, MCP usage.

---

## 15. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MCP v2 alpha instability | Medium | High | Pin SDK version; feature-flag `/api/mcp`; ship read tools only; REST fallback. |
| Private content leak via auth/RLS bug | Low | Very High | Automated access-matrix tests; no public/private data mixed in one query; code review policies. |
| Gamification race conditions / duplicate points | Medium | High | DB triggers for counters; atomic point awards; unique partial indexes; `user_daily_stats` for caps; load test. |
| OAuth users skip mandatory onboarding | Medium | High | Enforce in middleware and every write route; redirect to `/register/complete`. |
| Service-role key exposure | Low | Very High | Server-only env var; never accept from clients; rate-limit admin/MCP routes; audit every service-role query. |
| RLS policy performance / bugs | Medium | High | `EXPLAIN ANALYZE`; avoid nested subqueries; policy review in PRs. |
| Vercel function timeouts on MCP heavy tools | Medium | Medium | P95 instrumentation; split heavy tools into async job + `community://jobs/{id}` resource. |
| Upstash free-tier limits | Low | Medium | Monitor command/bandwidth usage; upgrade if > 80%. |
| Watched-phrase false positives | Medium | Medium | Auto-flag only; human review; track false-positive rate target < 10%. |
| NodeBB cutover DNS issues | Low | High | Keep VPS on standby 48h; use preview domain first; rollback via DNS. |
| EU jurisdictional exposure via Vercel | Medium | Medium | Signed DPA/SCCs; document limits; evaluate EU-hosted alternative if required later. |
| Empty-room problem at launch | High | High | Seed 20–30 posts before inviting; founding members post weekly for first month. |
| Over-building agent layer before user validation | Medium | High | Read tools only at launch; defer write/admin tools until REST UI is validated. |
