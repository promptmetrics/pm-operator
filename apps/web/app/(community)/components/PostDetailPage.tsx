'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, Share2, Flag } from 'lucide-react';
import { FlagDialog } from './FlagDialog';
import { Button } from '@pm-operator/ui/components/Button';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { RichTextEditor } from '@pm-operator/ui/editor/RichTextEditor';
import { CommentThread } from './CommentThread';
import { useRealtimePost } from './RealtimeProvider';
import { timeAgo } from '@/lib/format';
import { trackEvent } from '@/lib/analytics';
import type { PostDetail, CommentDetail } from '@pm-operator/api';

interface PostDetailPageProps {
  post: PostDetail;
  currentUserId?: string;
}

export function PostDetailPage({ post, currentUserId }: PostDetailPageProps) {
  const [comments, setComments] = React.useState<CommentDetail[]>([]);
  const [body, setBody] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(post.upvotes);

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
      alert(err.message || 'Comment failed');
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
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1 text-sm hover:bg-muted"
        >
          {post.group.color ? (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: post.group.color }} aria-hidden="true" />
          ) : null}
          {post.group.name}
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-surface p-6">
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
            <Link href={`/u/${post.author.userslug}`} className="font-medium hover:text-primary">
              {post.author.username}
            </Link>
            <p className="text-muted-foreground">
              {post.author.reputationScore} pts · {timeAgo(post.createdAt)}
            </p>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-semibold">{post.title}</h1>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="default">{typeLabel[post.type] ?? post.type}</Badge>
          {post.acceptedCommentId ? <Badge variant="emerald">Solved</Badge> : null}
          {post.tags.map((tag) => (
            <Badge key={tag} variant="outline">#{tag}</Badge>
          ))}
        </div>

        <div
          className="prose prose-sm max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div className="mt-6 flex items-center gap-1 border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLike}
            disabled={!currentUserId}
            className="gap-1"
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} aria-hidden="true" />
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
          <p className="text-center text-muted-foreground">No comments yet. Be the first to share your take.</p>
        )}
      </section>
    </div>
  );
}
