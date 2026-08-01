-- Phase 1 RLS hardening.
-- Replaces the overlapping policy suites from 0002_slimy_pandemic and 0008_concerned_centennial.
-- PostgreSQL OR-combines policies, so conflicting loose policies must be removed before
-- installing one coherent set.

--> statement-breakpoint

-- Drop every policy created by 0002_slimy_pandemic.
DROP POLICY IF EXISTS "users_select" ON "users";
DROP POLICY IF EXISTS "users_update" ON "users";
DROP POLICY IF EXISTS "groups_select" ON "groups";
DROP POLICY IF EXISTS "groups_insert" ON "groups";
DROP POLICY IF EXISTS "groups_update" ON "groups";
DROP POLICY IF EXISTS "gm_select" ON "group_memberships";
DROP POLICY IF EXISTS "gm_insert" ON "group_memberships";
DROP POLICY IF EXISTS "gm_delete" ON "group_memberships";
DROP POLICY IF EXISTS "gi_select" ON "group_invites";
DROP POLICY IF EXISTS "gi_insert" ON "group_invites";
DROP POLICY IF EXISTS "mt_select" ON "membership_tiers";
DROP POLICY IF EXISTS "mt_write" ON "membership_tiers";
DROP POLICY IF EXISTS "um_select" ON "user_memberships";
DROP POLICY IF EXISTS "posts_select" ON "posts";
DROP POLICY IF EXISTS "posts_insert" ON "posts";
DROP POLICY IF EXISTS "posts_update" ON "posts";
DROP POLICY IF EXISTS "comments_select" ON "comments";
DROP POLICY IF EXISTS "comments_insert" ON "comments";
DROP POLICY IF EXISTS "comments_update" ON "comments";
DROP POLICY IF EXISTS "reactions_select" ON "reactions";
DROP POLICY IF EXISTS "reactions_insert" ON "reactions";
DROP POLICY IF EXISTS "reactions_delete" ON "reactions";
DROP POLICY IF EXISTS "notifications_select" ON "notifications";
DROP POLICY IF EXISTS "notifications_update" ON "notifications";
DROP POLICY IF EXISTS "pe_select" ON "point_events";
DROP POLICY IF EXISTS "us_select" ON "user_scores";
DROP POLICY IF EXISTS "uds_select" ON "user_daily_stats";
DROP POLICY IF EXISTS "flags_select" ON "flags";
DROP POLICY IF EXISTS "flags_insert" ON "flags";
DROP POLICY IF EXISTS "flags_update" ON "flags";
DROP POLICY IF EXISTS "wp_select" ON "watched_phrases";
DROP POLICY IF EXISTS "wp_write" ON "watched_phrases";
DROP POLICY IF EXISTS "badges_select" ON "badges";
DROP POLICY IF EXISTS "user_badges_select" ON "user_badges";
DROP POLICY IF EXISTS "user_badges_write" ON "user_badges";
DROP POLICY IF EXISTS "aa_select" ON "agent_actions";
DROP POLICY IF EXISTS "mc_select" ON "mcp_clients";
DROP POLICY IF EXISTS "post_views_insert" ON "post_views";
DROP POLICY IF EXISTS "post_views_select" ON "post_views";

--> statement-breakpoint

-- Drop every policy created by 0008_concerned_centennial.
DROP POLICY IF EXISTS "users_public_read" ON "users";
DROP POLICY IF EXISTS "users_self_update" ON "users";
DROP POLICY IF EXISTS "groups_public_read" ON "groups";
DROP POLICY IF EXISTS "groups_member_read" ON "groups";
DROP POLICY IF EXISTS "group_memberships_self_read" ON "group_memberships";
DROP POLICY IF EXISTS "posts_public_read" ON "posts";
DROP POLICY IF EXISTS "posts_member_read" ON "posts";
DROP POLICY IF EXISTS "posts_author_write" ON "posts";
DROP POLICY IF EXISTS "comments_public_read" ON "comments";
DROP POLICY IF EXISTS "comments_member_read" ON "comments";
DROP POLICY IF EXISTS "comments_author_write" ON "comments";
DROP POLICY IF EXISTS "reactions_public_read" ON "reactions";
DROP POLICY IF EXISTS "reactions_self_write" ON "reactions";
DROP POLICY IF EXISTS "post_views_public_insert" ON "post_views";
DROP POLICY IF EXISTS "post_views_self_read" ON "post_views";
DROP POLICY IF EXISTS "notifications_self_all" ON "notifications";
DROP POLICY IF EXISTS "point_events_self_read" ON "point_events";
DROP POLICY IF EXISTS "user_daily_stats_self_read" ON "user_daily_stats";
DROP POLICY IF EXISTS "user_scores_public_read" ON "user_scores";
DROP POLICY IF EXISTS "user_badges_public_read" ON "user_badges";
DROP POLICY IF EXISTS "user_memberships_self_read" ON "user_memberships";
DROP POLICY IF EXISTS "flags_reporter_insert" ON "flags";

--> statement-breakpoint

-- Ensure RLS is enabled on all application tables. This is idempotent.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "group_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "point_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_daily_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "watched_phrases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "badges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_badges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_clients" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint

-- users: public profiles; users may update only their own row.
DROP POLICY IF EXISTS "users_select" ON "users";--> statement-breakpoint
CREATE POLICY "users_select" ON "users" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "users_update" ON "users";--> statement-breakpoint
CREATE POLICY "users_update" ON "users" FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

--> statement-breakpoint

-- groups: public circles readable by anyone; non-public circles only to members, creators, or admins.
DROP POLICY IF EXISTS "groups_select" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_select" ON "groups" FOR SELECT TO anon, authenticated USING (
  visibility = 'public'
  OR auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM "group_memberships" WHERE group_id = "groups".id AND user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "groups_insert" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_insert" ON "groups" FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
DROP POLICY IF EXISTS "groups_update" ON "groups";--> statement-breakpoint
CREATE POLICY "groups_update" ON "groups" FOR UPDATE TO authenticated USING (
  auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
  OR EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "groups".id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
) WITH CHECK (
  auth.uid() = created_by
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
  OR EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "groups".id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
);

--> statement-breakpoint

-- group_memberships: own memberships plus group moderators/admins and global admins.
DROP POLICY IF EXISTS "group_memberships_select" ON "group_memberships";--> statement-breakpoint
CREATE POLICY "group_memberships_select" ON "group_memberships" FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM "group_memberships" gm
    WHERE gm.group_id = "group_memberships".group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "group_memberships_insert" ON "group_memberships";--> statement-breakpoint
CREATE POLICY "group_memberships_insert" ON "group_memberships" FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "group_memberships_delete" ON "group_memberships";--> statement-breakpoint
CREATE POLICY "group_memberships_delete" ON "group_memberships" FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
  OR EXISTS (
    SELECT 1 FROM "group_memberships" gm
    WHERE gm.group_id = "group_memberships".group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
);

--> statement-breakpoint

-- group_invites: visible to inviter and group admins/moderators; created by them.
DROP POLICY IF EXISTS "group_invites_select" ON "group_invites";--> statement-breakpoint
CREATE POLICY "group_invites_select" ON "group_invites" FOR SELECT TO authenticated USING (
  inviter_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM "group_memberships" gm
    WHERE gm.group_id = "group_invites".group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "group_invites_insert" ON "group_invites";--> statement-breakpoint
CREATE POLICY "group_invites_insert" ON "group_invites" FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "group_invites".group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- membership_tiers: public read; admin-only writes.
DROP POLICY IF EXISTS "membership_tiers_select" ON "membership_tiers";--> statement-breakpoint
CREATE POLICY "membership_tiers_select" ON "membership_tiers" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "membership_tiers_write" ON "membership_tiers";--> statement-breakpoint
CREATE POLICY "membership_tiers_write" ON "membership_tiers" FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- user_memberships: own subscriptions plus global admins.
DROP POLICY IF EXISTS "user_memberships_select" ON "user_memberships";--> statement-breakpoint
CREATE POLICY "user_memberships_select" ON "user_memberships" FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- posts: read published posts in accessible groups; hidden/deleted only for privileged users.
DROP POLICY IF EXISTS "posts_select" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_select" ON "posts" FOR SELECT TO anon, authenticated USING (
  status <> 'deleted'
  AND (
    status <> 'hidden'
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    OR EXISTS (
      SELECT 1 FROM "group_memberships"
      WHERE group_id = "posts".group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  AND (
    EXISTS (SELECT 1 FROM "groups" WHERE id = "posts".group_id AND visibility = 'public')
    OR auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM "group_memberships"
      WHERE group_id = "posts".group_id AND user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
  )
);

-- posts inserts: public circles allow authenticated inserts; private/invite-only circles require membership.
-- All client inserts must set author_id to the current user.
DROP POLICY IF EXISTS "posts_public_insert" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_public_insert" ON "posts" FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM "groups" WHERE id = "posts".group_id AND visibility = 'public'
  )
);
DROP POLICY IF EXISTS "posts_member_insert" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_member_insert" ON "posts" FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "posts".group_id AND user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "posts_admin_insert" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_admin_insert" ON "posts" FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- posts updates/deletes: author, global moderators/admins, or circle moderators/admins.
DROP POLICY IF EXISTS "posts_update" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_update" ON "posts" FOR UPDATE TO authenticated USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "posts".group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
) WITH CHECK (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "posts".group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
);
DROP POLICY IF EXISTS "posts_delete" ON "posts";--> statement-breakpoint
CREATE POLICY "posts_delete" ON "posts" FOR DELETE TO authenticated USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR EXISTS (
    SELECT 1 FROM "group_memberships"
    WHERE group_id = "posts".group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
  )
);

--> statement-breakpoint

-- comments: same visibility as parent post; deleted/hidden only for privileged users.
DROP POLICY IF EXISTS "comments_select" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_select" ON "comments" FOR SELECT TO anon, authenticated USING (
  status <> 'deleted'
  AND (
    status <> 'hidden'
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    OR EXISTS (
      SELECT 1 FROM "group_memberships" gm
      JOIN "posts" p ON p.group_id = gm.group_id
      WHERE p.id = "comments".post_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'moderator')
    )
  )
  AND EXISTS (
    SELECT 1 FROM "posts" p
    JOIN "groups" g ON g.id = p.group_id
    WHERE p.id = "comments".post_id
      AND p.status <> 'deleted'
      AND (
        g.visibility = 'public'
        OR auth.uid() = "comments".author_id
        OR EXISTS (
          SELECT 1 FROM "group_memberships"
          WHERE group_id = g.id AND user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
      )
  )
);

-- comments inserts: public posts allow authenticated inserts; non-public circles require membership.
-- All client inserts must set author_id to the current user.
DROP POLICY IF EXISTS "comments_public_insert" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_public_insert" ON "comments" FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM "posts" p
    JOIN "groups" g ON g.id = p.group_id
    WHERE p.id = "comments".post_id AND p.status <> 'deleted' AND g.visibility = 'public'
  )
);
DROP POLICY IF EXISTS "comments_member_insert" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_member_insert" ON "comments" FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM "posts" p
    JOIN "group_memberships" gm ON gm.group_id = p.group_id
    WHERE p.id = "comments".post_id AND gm.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "comments_admin_insert" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_admin_insert" ON "comments" FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- comments updates/deletes: author or global moderators/admins.
DROP POLICY IF EXISTS "comments_update" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_update" ON "comments" FOR UPDATE TO authenticated USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
) WITH CHECK (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
DROP POLICY IF EXISTS "comments_delete" ON "comments";--> statement-breakpoint
CREATE POLICY "comments_delete" ON "comments" FOR DELETE TO authenticated USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

--> statement-breakpoint

-- reactions: read/write own reactions only on visible targets.
DROP POLICY IF EXISTS "reactions_select" ON "reactions";--> statement-breakpoint
CREATE POLICY "reactions_select" ON "reactions" FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM "posts" p
    JOIN "groups" g ON g.id = p.group_id
    WHERE p.id = "reactions".target_id AND "reactions".target_type = 'post'
      AND p.status <> 'deleted'
      AND (
        g.visibility = 'public'
        OR auth.uid() = p.author_id
        OR EXISTS (SELECT 1 FROM "group_memberships" WHERE group_id = g.id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
      )
  )
  OR EXISTS (
    SELECT 1 FROM "comments" c
    JOIN "posts" p ON p.id = c.post_id
    JOIN "groups" g ON g.id = p.group_id
    WHERE c.id = "reactions".target_id AND "reactions".target_type = 'comment'
      AND c.status <> 'deleted'
      AND p.status <> 'deleted'
      AND (
        g.visibility = 'public'
        OR auth.uid() = c.author_id
        OR EXISTS (SELECT 1 FROM "group_memberships" WHERE group_id = g.id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
      )
  )
);
DROP POLICY IF EXISTS "reactions_insert" ON "reactions";--> statement-breakpoint
CREATE POLICY "reactions_insert" ON "reactions" FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM "posts" p
      JOIN "groups" g ON g.id = p.group_id
      WHERE p.id = "reactions".target_id AND "reactions".target_type = 'post'
        AND p.status <> 'deleted'
        AND (
          g.visibility = 'public'
          OR auth.uid() = p.author_id
          OR EXISTS (SELECT 1 FROM "group_memberships" WHERE group_id = g.id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
        )
    )
    OR EXISTS (
      SELECT 1 FROM "comments" c
      JOIN "posts" p ON p.id = c.post_id
      JOIN "groups" g ON g.id = p.group_id
      WHERE c.id = "reactions".target_id AND "reactions".target_type = 'comment'
        AND c.status <> 'deleted'
        AND p.status <> 'deleted'
        AND (
          g.visibility = 'public'
          OR auth.uid() = c.author_id
          OR EXISTS (SELECT 1 FROM "group_memberships" WHERE group_id = g.id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
        )
    )
  )
);
DROP POLICY IF EXISTS "reactions_delete" ON "reactions";--> statement-breakpoint
CREATE POLICY "reactions_delete" ON "reactions" FOR DELETE TO authenticated USING (user_id = auth.uid());

--> statement-breakpoint

-- post_views: anonymous (NULL user_id) or self views on insert; reads restricted to owner/admin.
DROP POLICY IF EXISTS "post_views_insert" ON "post_views";--> statement-breakpoint
CREATE POLICY "post_views_insert" ON "post_views" FOR INSERT TO anon, authenticated WITH CHECK (
  user_id IS NULL OR user_id = auth.uid()
);
DROP POLICY IF EXISTS "post_views_select" ON "post_views";--> statement-breakpoint
CREATE POLICY "post_views_select" ON "post_views" FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- notifications: own only.
DROP POLICY IF EXISTS "notifications_all" ON "notifications";--> statement-breakpoint
CREATE POLICY "notifications_all" ON "notifications" FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

--> statement-breakpoint

-- point_events: own + admin.
DROP POLICY IF EXISTS "point_events_select" ON "point_events";--> statement-breakpoint
CREATE POLICY "point_events_select" ON "point_events" FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- user_scores: public read (leaderboards); no client writes.
DROP POLICY IF EXISTS "user_scores_select" ON "user_scores";--> statement-breakpoint
CREATE POLICY "user_scores_select" ON "user_scores" FOR SELECT TO anon, authenticated USING (true);

--> statement-breakpoint

-- user_daily_stats: own + admin.
DROP POLICY IF EXISTS "user_daily_stats_select" ON "user_daily_stats";--> statement-breakpoint
CREATE POLICY "user_daily_stats_select" ON "user_daily_stats" FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- flags: read/update by moderators/admins; insert only by the reporter themselves.
DROP POLICY IF EXISTS "flags_select" ON "flags";--> statement-breakpoint
CREATE POLICY "flags_select" ON "flags" FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
DROP POLICY IF EXISTS "flags_insert" ON "flags";--> statement-breakpoint
CREATE POLICY "flags_insert" ON "flags" FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "flags_update" ON "flags";--> statement-breakpoint
CREATE POLICY "flags_update" ON "flags" FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

--> statement-breakpoint

-- watched_phrases: admin/moderator only.
DROP POLICY IF EXISTS "watched_phrases_all" ON "watched_phrases";--> statement-breakpoint
CREATE POLICY "watched_phrases_all" ON "watched_phrases" FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

--> statement-breakpoint

-- badges / user_badges: public read; admin writes.
DROP POLICY IF EXISTS "badges_select" ON "badges";--> statement-breakpoint
CREATE POLICY "badges_select" ON "badges" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "user_badges_select" ON "user_badges";--> statement-breakpoint
CREATE POLICY "user_badges_select" ON "user_badges" FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "user_badges_write" ON "user_badges";--> statement-breakpoint
CREATE POLICY "user_badges_write" ON "user_badges" FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);

--> statement-breakpoint

-- agent_actions / mcp_clients: admin only.
DROP POLICY IF EXISTS "agent_actions_select" ON "agent_actions";--> statement-breakpoint
CREATE POLICY "agent_actions_select" ON "agent_actions" FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "mcp_clients_select" ON "mcp_clients";--> statement-breakpoint
CREATE POLICY "mcp_clients_select" ON "mcp_clients" FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM "users" WHERE id = auth.uid() AND role = 'admin')
);
