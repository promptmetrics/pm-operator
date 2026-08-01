ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "point_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_daily_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watched_phrases" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- Row-level security policies v1 (Phase 0).
-- The application uses the Supabase service-role key through Next.js API routes,
-- so these policies primarily govern any future direct Supabase client access.
-- Service-role queries bypass RLS by default.

-- users: public read of profile fields; users may update only their own row.
DROP POLICY IF EXISTS "users_public_read" ON "users";--> statement-breakpoint
CREATE POLICY "users_public_read" ON "users" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "users_self_update" ON "users";--> statement-breakpoint
CREATE POLICY "users_self_update" ON "users" FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- groups: public groups are readable by anyone; members can read their circles.
DROP POLICY IF EXISTS "groups_public_read" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_public_read" ON "groups" FOR SELECT TO anon, authenticated USING (visibility = 'public');
DROP POLICY IF EXISTS "groups_member_read" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_member_read" ON "groups" FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM "group_memberships" gm
    WHERE gm.group_id = "groups".id AND gm.user_id = auth.uid()
  )
);

-- group_memberships: members can see their own memberships.
DROP POLICY IF EXISTS "group_memberships_self_read" ON "group_memberships";--> statement-breakpoint
CREATE POLICY "group_memberships_self_read" ON "group_memberships" FOR SELECT TO authenticated USING (user_id = auth.uid());

-- posts: public feed reads published posts in public groups; members read published posts in their groups.
DROP POLICY IF EXISTS "posts_public_read" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_public_read" ON "posts" FOR SELECT TO anon, authenticated USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM "groups" g WHERE g.id = "posts".group_id AND g.visibility = 'public'
  )
);
DROP POLICY IF EXISTS "posts_member_read" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_member_read" ON "posts" FOR SELECT TO authenticated USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM "group_memberships" gm
    WHERE gm.group_id = "posts".group_id AND gm.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "posts_author_write" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_author_write" ON "posts" FOR ALL TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- comments: published comments on public posts, or posts in member groups.
DROP POLICY IF EXISTS "comments_public_read" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_public_read" ON "comments" FOR SELECT TO anon, authenticated USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM "posts" p JOIN "groups" g ON g.id = p.group_id
    WHERE p.id = "comments".post_id AND p.status = 'published' AND g.visibility = 'public'
  )
);
DROP POLICY IF EXISTS "comments_member_read" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_member_read" ON "comments" FOR SELECT TO authenticated USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM "posts" p
    JOIN "group_memberships" gm ON gm.group_id = p.group_id
    WHERE p.id = "comments".post_id AND p.status = 'published' AND gm.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "comments_author_write" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_author_write" ON "comments" FOR ALL TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

-- reactions: public read; users can manage only their own reactions.
DROP POLICY IF EXISTS "reactions_public_read" ON "reactions";--> statement-breakpoint
CREATE POLICY "reactions_public_read" ON "reactions" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "reactions_self_write" ON "reactions";--> statement-breakpoint
CREATE POLICY "reactions_self_write" ON "reactions" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- post_views: anonymous and authenticated views can be recorded; users can read their own.
DROP POLICY IF EXISTS "post_views_public_insert" ON "post_views";--> statement-breakpoint
CREATE POLICY "post_views_public_insert" ON "post_views" FOR INSERT TO anon, authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "post_views_self_read" ON "post_views";--> statement-breakpoint
CREATE POLICY "post_views_self_read" ON "post_views" FOR SELECT TO authenticated USING (user_id = auth.uid());

-- notifications, point_events, user_daily_stats: users can access only their own rows.
DROP POLICY IF EXISTS "notifications_self_all" ON "notifications";--> statement-breakpoint
CREATE POLICY "notifications_self_all" ON "notifications" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "point_events_self_read" ON "point_events";--> statement-breakpoint
CREATE POLICY "point_events_self_read" ON "point_events" FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "user_daily_stats_self_read" ON "user_daily_stats";--> statement-breakpoint
CREATE POLICY "user_daily_stats_self_read" ON "user_daily_stats" FOR SELECT TO authenticated USING (user_id = auth.uid());

-- user_scores and user_badges: leaderboards and badge awards are public.
DROP POLICY IF EXISTS "user_scores_public_read" ON "user_scores";--> statement-breakpoint
CREATE POLICY "user_scores_public_read" ON "user_scores" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "user_badges_public_read" ON "user_badges";--> statement-breakpoint
CREATE POLICY "user_badges_public_read" ON "user_badges" FOR SELECT TO anon, authenticated USING (true);

-- user_memberships: users can read their own subscriptions.
DROP POLICY IF EXISTS "user_memberships_self_read" ON "user_memberships";--> statement-breakpoint
CREATE POLICY "user_memberships_self_read" ON "user_memberships" FOR SELECT TO authenticated USING (user_id = auth.uid());

-- flags: authenticated users can submit their own reports.
DROP POLICY IF EXISTS "flags_reporter_insert" ON "flags";--> statement-breakpoint
CREATE POLICY "flags_reporter_insert" ON "flags" FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

-- Admin/config tables (membership_tiers, badges, watched_phrases, mcp_clients, agent_actions)
-- have RLS enabled with no anon/authenticated policies; they are managed through service-role API routes.