DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.notification_type'::regtype
      AND enumlabel = 'badge'
  ) THEN
    ALTER TYPE "public"."notification_type" ADD VALUE 'badge';
  END IF;
END $$;

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

-- posts: read if group public or member/author/admin; exclude deleted and hidden unless privileged.
CREATE POLICY posts_select ON posts FOR SELECT USING (
  status <> 'deleted'
  AND (
    status <> 'hidden'
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    OR EXISTS (
      SELECT 1 FROM group_memberships
      WHERE group_id = posts.group_id AND user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
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

-- comments: same visibility as parent post, write if member/admin; exclude deleted and hidden unless privileged.
CREATE POLICY comments_select ON comments FOR SELECT USING (
  status <> 'deleted'
  AND (
    status <> 'hidden'
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
    OR EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN posts p ON p.group_id = gm.group_id
      WHERE p.id = comments.post_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'moderator')
    )
  )
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
