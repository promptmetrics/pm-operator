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
export const notificationTypeEnum = pgEnum('notification_type', ['comment', 'reaction', 'solution', 'invite', 'flag', 'flag_resolved', 'mention', 'badge']);
export const dailyStatTypeEnum = pgEnum('daily_stat_type', ['posts_read', 'likes_given']);

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
    // Admin-set feature label (WS7/T7.2, migration 0012); null = not featured.
    featuredLabel: text('featured_label'),
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
