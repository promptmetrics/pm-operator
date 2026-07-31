ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_parent_comment_id_comments_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
    score = user_scores.score + EXCLUDED.score,
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

-- Deferred FK for posts.accepted_comment_id (tables must both exist).
ALTER TABLE posts
  ADD CONSTRAINT posts_accepted_comment_fk
  FOREIGN KEY (accepted_comment_id)
  REFERENCES comments(id)
  ON DELETE SET NULL;

-- Realtime publication.
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE posts, comments, notifications;
