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
  uniqueIndex,
  pgEnum,
  foreignKey,
  primaryKey,
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
// Flags and the moderation queue only ever target content. Audit logs need a
// wider vocabulary (settings, groups, users…), so they use auditTargetTypeEnum
// below rather than widening this one — flags.targetType is narrowed to the API's
// FlagTargetType on read, so extra members here break that mapping.
export const targetTypeEnum = pgEnum('target_type', ['post', 'comment', 'message']);
export const pointEventTypeEnum = pgEnum('point_event_type', [
  'topic_created',
  'comment_created',
  'solution_accepted',
  'like_received',
  'like_given',
  'invite_accepted',
  'daily_visit',
  'posts_read',
  'streak_bonus',
  'manual_award',
]);
export const leaderboardPeriodEnum = pgEnum('leaderboard_period', [
  'all_time',
  'quarterly',
  'monthly', // reserved for future use; launch only populates 'all_time'
  'weekly',
]);
export const inviteRoleEnum = pgEnum('invite_role', ['member', 'moderator', 'admin']);
export const flagStatusEnum = pgEnum('flag_status', ['open', 'resolved', 'dismissed']);
export const notificationTypeEnum = pgEnum('notification_type', ['comment', 'reaction', 'solution', 'invite', 'flag', 'flag_resolved', 'mention', 'badge', 'new_follower', 'new_message']);
export const dailyStatTypeEnum = pgEnum('daily_stat_type', ['posts_read', 'likes_given']);
export const auditActionTypeEnum = pgEnum('audit_action_type', [
  'settings_update',
  'user_role_change',
  'group_create',
  'group_update',
  'group_delete',
  'badge_create',
  'badge_award',
  'tier_create',
  'tier_update',
  'watched_phrase_create',
  'watched_phrase_delete',
  'points_award',
  'mcp_client_revoke',
  'community_delete',
]);

// Sentinel UUID used for global leaderboard rows in user_scores.
// Migration 0001_numerous_killer_shrike.sql seeds a matching groups row so the FK is satisfied.
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
    longestStreakDays: integer('longest_streak_days').default(0).notNull(),
    // WS9 social graph: trigger-maintained follow counts (migration 0016).
    followerCount: integer('follower_count').default(0).notNull(),
    followingCount: integer('following_count').default(0).notNull(),
    // UTC day the streak last advanced (null until first advancing activity).
    streakLastDate: date('streak_last_date'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    preferences: jsonb('preferences').default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roleIdx: index('users_role_idx').on(table.role),
    lowerUsernameIdx: uniqueIndex('users_lower_username_idx').on(sql`lower(${table.username})`),
    lowerUserslugIdx: uniqueIndex('users_lower_userslug_idx').on(sql`lower(${table.userslug})`),
  })
).enableRLS();

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
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
    inviterIdx: index('group_invites_inviter_idx').on(table.inviterId),
  })
).enableRLS();

// Server-generated preview card for the first URL in a post/comment body
// (track 2A). Mirrors `linkPreviewSchema` in @pm-operator/api (the packages
// have no dependency edge, so the shape is duplicated here for `$type`).
export type LinkPreview = {
  url: string;
  domain: string;
  title: string;
  desc: string | null;
};

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    // SEO-friendly path segment; unique within a circle (e.g. "my-build-post-abc1234a").
    slug: text('slug').notNull(),
    // Admin-set feature label (WS7/T7.2, migration 0012); null = not featured.
    featuredLabel: text('featured_label'),
    // Optional social/featured image. Stored as a /post-images/ path or external URL.
    coverImageUrl: text('cover_image_url'),
    // Server-generated card for the first URL in the body (migration 0024); null = no card.
    linkPreview: jsonb('link_preview').$type<LinkPreview | null>(),
    // FK added in migration 0001_numerous_killer_shrike.sql to avoid circular module load.
    acceptedCommentId: uuid('accepted_comment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupStatusCreatedIdx: index('posts_group_status_created_idx').on(table.groupId, table.status, table.createdAt),
    typeIdx: index('posts_type_idx').on(table.type),
    statusIdx: index('posts_status_idx').on(table.status),
    tagsGinIdx: index('posts_tags_gin_idx').using('gin', table.tags),
    // 'simple' dictionary supports multilingual EU content at launch; no English-only stemming.
    contentFtsIdx: index('posts_content_fts_idx').using(
      'gin',
      sql`to_tsvector('simple', ${table.contentPlain})`
    ),
    contentTrgmIdx: index('posts_content_trgm_idx').using(
      'gin',
      sql`lower(${table.contentPlain}) gin_trgm_ops`
    ),
    // Slug uniqueness is scoped to the circle: /g/<groupSlug>/<postSlug>.
    uniqueGroupSlugIdx: uniqueIndex('posts_group_slug_idx').on(table.groupId, table.slug),
  })
).enableRLS();

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentCommentId: uuid('parent_comment_id'),
    content: text('content').notNull(), // sanitized HTML from TipTap
    contentPlain: text('content_plain').notNull(), // extracted plain text for search / summaries
    // Server-generated card for the first URL in the body (migration 0024); null = no card.
    linkPreview: jsonb('link_preview').$type<LinkPreview | null>(),
    upvotes: integer('upvotes').default(0).notNull(),
    status: commentStatusEnum('status').default('published').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    postCreatedIdx: index('comments_post_created_idx').on(table.postId, table.createdAt),
    postParentCreatedIdx: index('comments_post_parent_created_idx').on(table.postId, table.parentCommentId, table.createdAt),
    parentCommentFk: foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
      name: 'comments_parent_comment_id_fk',
    }),
  })
).enableRLS();

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
).enableRLS();

export const savedPosts = pgTable(
  'saved_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserPost: unique('saved_posts_user_post_idx').on(table.userId, table.postId),
    userCreatedIdx: index('saved_posts_user_created_idx').on(table.userId, table.createdAt),
  })
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
    uniqueDailyVisit: uniqueIndex('point_events_daily_visit_idx')
      .on(table.userId, sql`CAST((${table.awardedAt} AT TIME ZONE 'UTC') AS date)`)
      .where(sql`${table.eventType} = 'daily_visit'`),
    uniqueStreakBonus: uniqueIndex('point_events_streak_bonus_idx')
      .on(table.userId, sql`CAST((${table.awardedAt} AT TIME ZONE 'UTC') AS date)`)
      .where(sql`${table.eventType} = 'streak_bonus'`),
  })
).enableRLS();

export const userScores = pgTable(
  'user_scores',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull().default(GLOBAL_GROUP_ID),
    period: leaderboardPeriodEnum('period').notNull(),
    // Start of the scoring window (date_trunc of week/month/quarter).
    // all_time rows use the 1970-01-01 sentinel.
    periodStart: date('period_start').notNull().default('1970-01-01'),
    score: numeric('score', { precision: 12, scale: 2 }).default('0').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: unique('user_scores_pk').on(table.userId, table.groupId, table.period, table.periodStart),
    scoreIdx: index('user_scores_score_idx').on(table.groupId, table.period, table.periodStart, table.score),
  })
).enableRLS();

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
).enableRLS();

export const badges = pgTable('badges', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  criteria: jsonb('criteria').default(sql`'{}'::jsonb`).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

export const watchedPhrases = pgTable('watched_phrases', {
  id: uuid('id').defaultRandom().primaryKey(),
  phrase: text('phrase').notNull().unique(),
  sanctionedFraming: text('sanctioned_framing'), // suggested alternative phrasing shown to users when content is auto-flagged
  isRegex: boolean('is_regex').default(false).notNull(),
  autoFlag: boolean('auto_flag').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

// T8.5: community events. Optionally scoped to a circle (groupId null = global
// event). Public read; writes restricted to site-admins / circle admins via RLS.
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    location: text('location'),
    url: text('url'),
    capacity: integer('capacity'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupStartsIdx: index('events_group_starts_idx').on(table.groupId, table.startsAt),
    startsIdx: index('events_starts_idx').on(table.startsAt),
  })
).enableRLS();

// T9.1: social follow graph. Composite PK on (follower, followee) makes the
// pair unique and not-null. Count columns on `users` are kept in sync by the
// update_follow_counts trigger (migration 0016), so profile pages read counts
// without an extra `count(*)` (pool-safe). RLS: self-only writes; edge lists
// self-only (decision 2A); counts are public.
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followerId, table.followeeId] }),
    followeeIdx: index('follows_followee_idx').on(table.followeeId, table.createdAt),
    followerIdx: index('follows_follower_idx').on(table.followerId, table.createdAt),
  })
).enableRLS();

// T9.2: direct messages (3-table model, decision D9.2). Capped to 2
// participants at launch in the service; the schema permits N for a later
// group-DM capacity change. conversations.updated_at is bumped by the
// update_conversation_updated_at trigger on each message insert (D9.7), so the
// inbox sorts by last activity without a read-time aggregate.
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  () => ({})
).enableRLS();

// Admin audit log
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actorCreatedIdx: index('audit_log_actor_created_idx').on(table.actorId, table.createdAt),
    targetIdx: index('audit_log_target_idx').on(table.targetType, table.targetId),
  })
).enableRLS();

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conversationId, table.userId] }),
    byUserIdx: index('conversation_participants_user_idx').on(table.userId, table.joinedAt),
  })
).enableRLS();

// messages.author_id is set-null (NOT cascade) on user erasure so the
// counterparty's thread survives; the erasure step blanks the body first
// (D9.4, docs/GDPR-ERASURE-RUNBOOK.md §5).
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    contentPlain: text('content_plain').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byConversationIdx: index('messages_conversation_created_idx').on(
      table.conversationId,
      table.createdAt
    ),
  })
).enableRLS();

// Audit log for admin/moderator actions (Sprint 3: Moderation & Content).
// The first seven are moderation actions. The rest are admin actions, added
// 2026-08-11: the routes had always passed them, but they were missing here, so
// Postgres rejected every insert AFTER the mutation had already committed — the
// change landed and the request 500'd. Adding an action here is now mandatory,
// since adminCreateAuditLog derives its parameter type from this enum.
export const auditLogActionEnum = pgEnum('audit_log_action', [
  'flag_resolved',
  'flag_dismissed',
  'post_approved',
  'post_declined',
  'user_warned',
  'user_banned',
  'content_hidden',
  'settings_update',
  'mcp_client_revoke',
  'update_group',
  'delete_group',
  'update_user_role',
  'delete_user',
  'create_invite',
  'revoke_invite',
  // 2026-08-14: added for MCP admin tools (community:admin scope). Each is
  // emitted by an MCP admin tool's audit-log write; without them the insert
  // would 500 after the mutation committed — same class of bug 0024 fixed.
  'create_group',
  'award_points',
  'create_badge',
  'award_badge',
  'watched_phrase_create',
  'watched_phrase_delete',
]);

// Audit-log targets. Deliberately separate from targetTypeEnum: that one belongs
// to flags/moderation, which only ever point at content, and widening it changes
// the inferred select type there too.
export const auditTargetTypeEnum = pgEnum('audit_target_type', [
  'post',
  'comment',
  'message',
  'settings',
  'group',
  'mcp_client',
  'user',
  'invite',
]);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    action: auditLogActionEnum('action').notNull(),
    targetType: auditTargetTypeEnum('target_type'),
    targetId: uuid('target_id'),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    circleId: uuid('circle_id').references(() => groups.id, { onDelete: 'set null' }),
    details: jsonb('details').default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actorIdx: index('audit_logs_actor_idx').on(table.actorId, table.createdAt),
    actionIdx: index('audit_logs_action_idx').on(table.action, table.createdAt),
    targetIdx: index('audit_logs_target_idx').on(table.targetType, table.targetId),
    circleIdx: index('audit_logs_circle_idx').on(table.circleId, table.createdAt),
  })
).enableRLS();

export const communitySettings = pgTable('community_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').default(sql`'{}'::jsonb`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();


