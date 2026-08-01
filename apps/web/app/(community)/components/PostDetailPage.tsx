'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, Share2, Flag, Pin, Star } from 'lucide-react';
import { FlagDialog } from './FlagDialog';
import { Button } from '@pm-operator/ui/components/Button';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Input } from '@pm-operator/ui/components/Input';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { useToast } from '@pm-operator/ui/components/Toast';
import { RichTextEditor } from '@pm-operator/ui/editor/RichTextEditor';
import { CommentThread } from './CommentThread';
import { useRealtimePost } from './RealtimeProvider';
import { timeAgo } from '@/lib/format';
import { trackEvent } from '@/lib/analytics';
import type { PostDetail, CommentDetail } from '@pm-operator/api';

interface PostDetailPageProps {
  post: PostDetail;
  currentUserId?: string;
  viewerRole?: string;
}

export function PostDetailPage({ post, currentUserId, viewerRole }: PostDetailPageProps) {
  const [comments, setComments] = React.useState<CommentDetail[]>([]);
  const [body, setBody] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [liked, setLiked] = React.useState(Boolean(post.viewerHasLiked));
  const [likeCount, setLikeCount] = React.useState(post.upvotes);
  const [pinned, setPinned] = React.useState(post.isPinned);
  const [featuredLabel, setFeaturedLabel] = React.useState(post.featuredLabel);
  const [featureInput, setFeatureInput] = React.useState(post.featuredLabel ?? '');
  const [savingAdmin, setSavingAdmin] = React.useState(false);
  const isGlobalAdmin = viewerRole === 'admin';
  const { toast } = useToast();

  const patchPost = async (patch: { isPinned?: boolean; featuredLabel?: string | null }) => {
    setSavingAdmin(true);
    try {
      const res = await fetch(`/api/v1/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Update failed');
      return true;
    } catch (err: any) {
      toast({ title: err.message || 'Update failed', variant: 'error' });
      return false;
    } finally {
      setSavingAdmin(false);
    }
  };

  const loadComments = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/comments`);
      if (!res.ok) throw new Error('Failed to load comments');
      const json = (await res.json()) as { data?: { comments: CommentDetail[] } };
      setComments(json.data?.comments ?? []);
    } catch {
      // leave existing comments
    }
  }, [post.id]);

  React.useEffect(() => {
    loadComments();
  }, [loadComments]);

  useRealtimePost(
    (commentId) => {
      // A new comment arrived; refetch to get nested structure and author details.
      loadComments();
    },
    post.id
  );

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: body }),
      });
      if (!res.ok) throw new Error('Comment failed');
      trackEvent('first_comment', { postId: post.id });
      setBody('');
      loadComments();
    } catch (err: any) {
      toast({ title: err.message || 'Comment failed', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async () => {
    if (!currentUserId) return;
    const previous = likeCount;
    setLiked((l) => !l);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    try {
      const res = await fetch('/api/v1/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: post.id, reactionType: 'like' }),
      });
      if (!res.ok) throw new Error('Like failed');
      const json = (await res.json()) as { data?: { removed?: boolean; id?: string } };
      const removed = json.data?.removed ?? !json.data?.id;
      setLiked(!removed);
      setLikeCount(removed ? previous - 1 : previous + 1);
    } catch {
      setLiked((l) => !l);
      setLikeCount(previous);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const typeLabel: Record<string, string> = {
    question: 'Question',
    build: 'Build',
    discussion: 'Discussion',
    lesson: 'Lesson',
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link
          href={`/g/${post.group.slug}`}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--pm-line)] px-3 py-1 text-sm hover:bg-[var(--pm-paper-2)]"
        >
          {post.group.color ? (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: post.group.color }} aria-hidden="true" />
          ) : null}
          {post.group.name}
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6">
        <div className="mb-4 flex items-center gap-3">
          <Link href={`/u/${post.author.userslug}`}>
            <Avatar
              src={post.author.pictureUrl ?? undefined}
              alt={post.author.username}
              fallback={post.author.fullName || post.author.username}
              size="md"
            />
          </Link>
          <div className="text-sm">
            <Link href={`/u/${post.author.userslug}`} className="font-medium hover:text-[var(--pm-coral-dark)]">
              {post.author.username}
            </Link>
            <p className="text-[var(--pm-muted)]">
              {post.author.reputationScore} pts · {timeAgo(post.createdAt)}
            </p>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-semibold">{post.title}</h1>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="default">{typeLabel[post.type] ?? post.type}</Badge>
          {post.acceptedCommentId ? <Badge variant="green">Solved</Badge> : null}
          {pinned ? (
            <Badge variant="coral" className="gap-1">
              <Pin className="h-3 w-3" aria-hidden="true" />
              Pinned
            </Badge>
          ) : null}
          {featuredLabel ? (
            <Badge variant="coral" className="gap-1">
              <Star className="h-3 w-3" aria-hidden="true" />
              {featuredLabel}
            </Badge>
          ) : null}
          {post.tags.map((tag) => (
            <Badge key={tag} variant="outline">#{tag}</Badge>
          ))}
        </div>

        <div
          className="prose prose-sm max-w-none text-[var(--pm-ink)]"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div className="mt-6 flex items-center gap-1 border-t border-[var(--pm-line)] pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={!currentUserId}
            className="gap-1"
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-[var(--pm-coral)] text-[var(--pm-coral)]' : ''}`} aria-hidden="true" />
            <span className="text-xs">{likeCount}</span>
          </Button>

          <Button variant="ghost" size="sm" className="gap-1">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">{post.commentCount}</span>
          </Button>

          <Button variant="ghost" size="sm" className="gap-1" onClick={handleShare}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">Share</span>
          </Button>

          {currentUserId ? (
            <FlagDialog targetType="post" targetId={post.id}>
              <Button variant="ghost" size="sm" className="gap-1">
                <Flag className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs">Flag</span>
              </Button>
            </FlagDialog>
          ) : null}
        </div>

        {isGlobalAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--pm-line)] pt-3">
            <span className="text-xs font-medium text-[var(--pm-muted)]">Admin</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={savingAdmin}
              className="gap-1"
              onClick={async () => {
                const next = !pinned;
                if (await patchPost({ isPinned: next })) {
                  setPinned(next);
                  toast({ title: next ? 'Post pinned' : 'Post unpinned' });
                }
              }}
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              {pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Input
              value={featureInput}
              onChange={(e) => setFeatureInput(e.target.value)}
              placeholder="Feature label, e.g. Build of the week"
              maxLength={40}
              aria-label="Feature label"
              className="h-8 w-60 text-sm"
            />
            <Button
              size="sm"
              disabled={savingAdmin || !featureInput.trim()}
              className="gap-1"
              onClick={async () => {
                const label = featureInput.trim();
                if (await patchPost({ featuredLabel: label })) {
                  setFeaturedLabel(label);
                  toast({ title: 'Post featured' });
                }
              }}
            >
              <Star className="h-3.5 w-3.5" aria-hidden="true" />
              Feature
            </Button>
            {featuredLabel ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={savingAdmin}
                onClick={async () => {
                  if (await patchPost({ featuredLabel: null })) {
                    setFeaturedLabel(null);
                    setFeatureInput('');
                    toast({ title: 'Feature cleared' });
                  }
                }}
              >
                Clear feature
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {currentUserId ? (
        <form onSubmit={submitComment} className="mb-8 flex flex-col gap-3">
          <RichTextEditor
            value={body}
            onChange={(html) => setBody(html)}
            placeholder="Add a comment..."
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !body.trim()}>
              {submitting ? 'Posting...' : 'Post comment'}
            </Button>
          </div>
        </form>
      ) : null}

      <section aria-label="Comments">
        {comments.length > 0 ? (
          <CommentThread
            comments={comments}
            postId={post.id}
            postAuthorId={post.authorId}
            currentUserId={currentUserId}
            acceptedCommentId={post.acceptedCommentId}
            onChange={loadComments}
          />
        ) : (
          <p className="text-center text-[var(--pm-muted)]">No comments yet. Be the first to share your take.</p>
        )}
      </section>
    </div>
  );
}
