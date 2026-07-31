# Community backend design — Operator Stack

**Status:** draft — 2026-07-29  
**Goal:** replace the NodeBB headless backend with a purpose-built community backend that feels like Skool + daily.dev and exposes a first-class REST API for Claude Code and the future agent loop.

## Why replace NodeBB

NodeBB is a forum engine, not a modern community platform. It fought us on:

- Custom registration fields (the onboarding question required hook archaeology).
- Headless profile APIs (`filter:user.whitelistFields` + `filter:helpers.getUserDataByUserSlug` fallback just to surface one field).
- Clean agent API (NodeBB has no MCP; the agent loop would have to speak forum-shaped REST).

This design trades NodeBB's built-in admin/moderation for full control over the data model and API.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 16 App Router on Vercel | Reuse the existing Paper-v3 Next.js app in `web/`. |
| API | Next.js API routes (`app/api/v1/**`) | Defined explicitly for both UI and agent access. |
| Database | Supabase Postgres | Relational, good for feed/leaderboard queries. |
| Auth | Supabase Auth | GitHub, Google, LinkedIn OAuth out of the box; email/password; JWT sessions. |
| Realtime | Supabase Realtime | Live feed updates, notifications. |
| Storage | Supabase Storage | Avatars, attachments. |
| ORM | Drizzle Kit + Drizzle ORM | Type-safe migrations and queries. |
| Admin | Custom Next.js ACP pages | Lightweight; or use Supabase Studio for DB ops. |
| Cache | Vercel Edge Config / Redis (later) | Not needed on free tier at launch. |

## Free-tier feasibility

Supabase Free: 500 MB DB, 1 GB storage, 50K MAU, 5 GB egress, 200 peak realtime connections, 2M realtime messages/month. Projects pause after 7 days of inactivity — acceptable for development, not for production.

Vercel Hobby: 1M function invocations, 4 CPU-hours, 100 GB edge transfer, 1M edge requests. **Hobby is non-commercial-only**; move to Vercel Pro before public commercial launch.

Real-world proof: [NeighborHub](https://neighbor-hub-phi.vercel.app/), [What We Will](https://community-platform-x74m.vercel.app/), [SocialConnect](https://github.com/stuhamz/SocialConnect), and [Braga AI Builders](https://braga-ai-builders.vercel.app/) all run on Vercel + Supabase free tiers.

Upgrade triggers:
- Supabase DB near 400 MB → Pro.
- Vercel Pro before commercial launch (fair-use requirement).
- Realtime peak connections near 150 → Pro.

## Data model

Core tables. All use `uuid` primary keys and `created_at` / `updated_at` timestamps unless noted.

### `users`
```sql
id uuid primary key default gen_random_uuid()
email text unique not null
email_confirmed boolean default false
username text unique not null
userslug text unique not null
full_name text
picture_url text
about_me text
linkedin_id text unique
github_id text unique
google_id text unique
painful_tool_stack_task text        -- mandatory onboarding answer
role text default 'member'           -- member, moderator, admin
reputation_score integer default 0
streak_days integer default 0
last_active_at timestamptz
preferences jsonb default '{}'
```

### `groups` (Skool-style circles)
```sql
id uuid primary key default gen_random_uuid()
slug text unique not null
name text not null
description text
color text
is_public boolean default true
member_count integer default 0
created_by uuid references users(id)
```

### `group_memberships`
```sql
id uuid primary key default gen_random_uuid()
group_id uuid references groups(id) on delete cascade
user_id uuid references users(id) on delete cascade
role text default 'member'           -- member, moderator, admin
joined_at timestamptz default now()
unique(group_id, user_id)
```

### `posts`
```sql
id uuid primary key default gen_random_uuid()
group_id uuid references groups(id) on delete set null
author_id uuid references users(id) on delete set null
title text
content text not null                -- HTML from TipTap
content_plain text                   -- for search/summaries
type text default 'discussion'       -- discussion, build, question, lesson
status text default 'published'      -- published, draft, flagged, deleted
tags text[] default '{}'
upvotes integer default 0
comment_count integer default 0
view_count integer default 0
is_solved boolean default false
accepted_comment_id uuid references comments(id) on delete set null
```

### `comments`
```sql
id uuid primary key default gen_random_uuid()
post_id uuid references posts(id) on delete cascade
author_id uuid references users(id) on delete set null
parent_comment_id uuid references comments(id) on delete cascade
content text not null
upvotes integer default 0
is_answer boolean default false
```

### `reactions` (upvotes / likes)
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references users(id) on delete cascade
target_type text not null            -- post, comment
target_id uuid not null
reaction_type text default 'upvote'  -- upvote, like, celebrate
created_at timestamptz default now()
unique(user_id, target_type, target_id)
```

### `point_events`
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references users(id) on delete cascade
event_type text not null             -- topic_created, comment_created, solution_accepted, like_received, like_given, invite_accepted, daily_visit, posts_read
points numeric(10,2) not null
context jsonb default '{}'           -- post_id, group_id, etc.
awarded_at timestamptz default now()
```

### `badges`
```sql
id uuid primary key default gen_random_uuid()
slug text unique not null
name text not null
description text
icon_url text
```

### `user_badges`
```sql
id uuid primary key default gen_random_uuid()
user_id uuid references users(id) on delete cascade
badge_id uuid references badges(id) on delete cascade
awarded_at timestamptz default now()
unique(user_id, badge_id)
```

### `invites`
```sql
id uuid primary key default gen_random_uuid()
inviter_id uuid references users(id) on delete set null
email text
used_by_user_id uuid references users(id) on delete set null
used_at timestamptz
status text default 'pending'        -- pending, accepted, expired
```

### `flags` (moderation)
```sql
id uuid primary key default gen_random_uuid()
target_type text not null            -- post, comment, user
target_id uuid not null
reporter_id uuid references users(id) on delete set null
reason text
status text default 'open'           -- open, resolved, dismissed
resolver_id uuid references users(id) on delete set null
resolved_at timestamptz
```

### `watched_phrases`
```sql
id uuid primary key default gen_random_uuid()
phrase text not null
sanctioned_framing text              -- e.g. replace "autonomous agents" with "governed, supervised agents"
is_regex boolean default false
auto_flag boolean default true
```

## Gamification engine

Scoring rules, ported and simplified from `config/gamification.md`:

| Event | Points | Notes |
|---|---|---|
| `topic_created` | 5 | All groups. |
| `comment_created` | 3 | Replies; excludes the author's own first comment on their post. |
| `solution_accepted` | 8 | Author of the comment marked as answer. |
| `like_received` | 2 | Per reaction. |
| `like_given` | 1 | Per reaction given. |
| `invite_accepted` | 5 | Inviter gets the points. |
| `posts_read` | 0.5 | Capped per day. |
| `daily_visit` | 0.5 | Once per UTC day. |
| `flag_accepted` | 0 | Moderation hygiene, not a game metric. |

Leaderboards:

1. **Operator Stack** — quarterly, all groups, global weights.
2. **Show Your Build** — all-time, group-scoped to `show-your-build`, weights: topic 8, comment 4.
3. **All-Time Operators** — all-time, all groups, global weights.

Badges (from `config/badges.md`):

1. **First Build** — first post in "Show Your Build".
2. **Gatekeeper** — 3+ accepted solutions.
3. **Open Registry Contributor** — first post in "Skill Registry".

Implementation approach:
- A PostgreSQL function `award_points(user_id, event_type, points, context)` inserts into `point_events` and updates `users.reputation_score`.
- A nightly job (Supabase cron or Vercel cron) runs badge grants.
- Leaderboards are computed on read with a materialized view or a fast window query over `point_events`.

## API endpoints (Claude-native)

All under `/api/v1`. Human UI and agent use the same endpoints. Agent authenticates with a service-role JWT that bypasses RLS for reads and limited writes.

### Auth
```
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/forgot-password
GET  /auth/me
GET  /auth/oauth/:provider/redirect   # GitHub/Google/LinkedIn
GET  /auth/oauth/:provider/callback
```

### Feed / posts
```
GET    /feed?group=...&tag=...&page=...&limit=...
POST   /posts
GET    /posts/:id
PATCH  /posts/:id
DELETE /posts/:id
POST   /posts/:id/comments
GET    /posts/:id/comments
POST   /posts/:id/accept-comment
```

### Reactions
```
POST   /reactions
DELETE /reactions/:id
```

### Users / profiles
```
GET    /users/:slug
PATCH  /users/me
GET    /users/:slug/score
GET    /users/:slug/badges
```

### Groups
```
GET    /groups
POST   /groups                # admin only
POST   /groups/:slug/join
DELETE /groups/:slug/membership
GET    /groups/:slug/members
```

### Gamification
```
GET    /leaderboards?type=operator-stack|show-your-build|all-time&period=...
GET    /leaderboards/scores/me
POST   /points/award           # service role only
POST   /badges/grant           # service role only
```

### Invites
```
POST   /invites
GET    /invites/:code
POST   /invites/:code/accept
```

### Moderation
```
POST   /flags
GET    /flags                  # moderator+
PATCH  /flags/:id/resolve      # moderator+
DELETE /flags/:id              # moderator+
```

### Agent loop (explicitly for Claude / future agent)
```
GET    /agent/leaderboards
GET    /agent/users/:slug/qualify   # paid-tier rubric check
POST   /agent/invites/beta          # invite qualifying user to beta repo
GET    /agent/flags/recent
POST   /agent/posts/:id/reply       # agent can reply on behalf of system user
```

## Auth flow

1. **Email/password:** Supabase Auth handles signup/login. The Next.js register page sends `painful_tool_stack_task`; the backend rejects empty answers.
2. **SSO:** Supabase Auth OAuth providers (GitHub, Google, LinkedIn). On first OAuth login, the user is created and a post-auth hook redirects to an interstitial if `painful_tool_stack_task` is empty.
3. **Mandatory onboarding:** enforced in two places:
   - API: reject registration if the field is empty.
   - Middleware: redirect authenticated users without the answer to `/register/complete` until answered.

## Realtime

Use Supabase Realtime for:
- New posts in the feed (`posts` table INSERT).
- New comments on an open post (`comments` table INSERT).
- Notification count changes (`notifications` table INSERT).

Frontend subscribes via Supabase client; no custom socket.io server needed.

## Frontend changes from current Next.js app

- Replace `web/app/lib/nodebb.ts` with `web/app/lib/api.ts` that calls `/api/v1/*`.
- Replace socket.io with Supabase Realtime in `web/app/lib/realtime.ts`.
- Simplify `web/app/providers.tsx` — no CSRF token, no `getConfig()` dance.
- Convert profile page to read from `/api/v1/users/:slug`.
- Add group pages (`/g/:slug`) matching Skool layout.
- Remove all NodeBB-specific slug/pagination workarounds.

## Migration plan from NodeBB

Current state: NodeBB is live with only test accounts. No real data.

1. **Build the new backend** in a separate directory or branch.
2. **Seed groups and tags** via a simple SQL script or API call.
3. **Set up Supabase Auth** with the three OAuth providers.
4. **Deploy the new frontend** to a preview domain (e.g. `operator-v2.promptmetrics.dev`).
5. **Verify** SSO, onboarding, feed, leaderboards, badges, moderation flags.
6. **Switch DNS** from the old VPS to Vercel.
7. **Decommission the NodeBB VPS** (confirm with user before destroying).

No data migration needed because there is no production data.

## Admin / moderation

Build lightweight ACP pages under `/admin` in the Next.js app:
- `/admin/flags` — moderation queue.
- `/admin/users` — member list, ban/suspend.
- `/admin/groups` — create/edit circles.
- `/admin/gamification` — adjust point weights and badges.

Access controlled by `users.role` middleware.

## Security model

- **RLS policies** on all tables:
  - Users can read public posts/comments.
  - Users can edit/delete only their own posts/comments.
  - Group-scoped posts visible only to group members if `groups.is_public = false`.
  - Only moderators/admins can resolve flags.
- **Service role key** for the agent loop and cron jobs; kept in Vercel env vars, never exposed to client.
- **Input sanitization** with `xss` (already a dependency in `web/package.json`).
- **Watched phrases** checked on post/comment creation; if matched, auto-create a `flags` row and optionally reject the content.

## Open decisions

1. **Keep the current VPS during the rebuild?** Yes — the NodeBB site stays live as a placeholder while the Vercel/Supabase version is built on a preview domain.
2. **Build backend as a monorepo or separate repo?** Recommendation: keep it in `pm-community` under a new `apps/api` or `packages/db` structure; migrate `web/` to `apps/web`. This makes Claude Code operations easier.
3. **Use Supabase Edge Functions for gamification?** Not at launch. Keep point awarding in Next.js API routes; move to Edge Functions later if needed.
4. **Self-serve onboarding answer editing?** Yes — add a profile edit control after launch.

## Suggested first week of work

1. Set up Supabase project and local schema with Drizzle.
2. Implement `users`, `groups`, `group_memberships`, `posts`, `comments` tables.
3. Replace auth: Supabase Auth + OAuth providers.
4. Build `/api/v1/feed` and `/api/v1/posts` endpoints.
5. Port the existing Next.js profile page to the new API.
6. Verify onboarding field enforcement end-to-end.

## Files to create (next steps)

- `apps/api/lib/db/schema.ts` — Drizzle schema.
- `apps/api/lib/db/migrations/` — migration files.
- `apps/api/app/api/v1/feed/route.ts` — first API route.
- `apps/web/lib/api.ts` — API client (replaces `nodebb.ts`).
- `supabase/config.toml` — local Supabase config.

## Sources and references

- Supabase pricing: https://supabase.com/pricing
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- Vercel limits: https://vercel.com/docs/limits
- Vercel fair use: https://vercel.com/docs/limits/fair-use-guidelines
- Existing project specs: `config/gamification.md`, `config/badges.md`, `docs/RUNBOOK.md`, `docs/ACP-SETUP.md`.
