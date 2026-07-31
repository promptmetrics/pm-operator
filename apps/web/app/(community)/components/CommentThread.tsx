'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, CheckCircle2, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@pm-operator/ui/components/Button';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { RichTextEditor } from '@pm-operator/ui/editor/RichTextEditor';
import { timeAgo } from '@/lib/format';
import { trackEvent } from '@/lib/analytics';
import type { CommentDetail } from '@pm-operator/api';

interface CommentThreadProps {
  comments: CommentDetail[];
  postId: string;
  postAuthorId?: string;
  currentUserId?: string;
  acceptedCommentId?: string | null;
  onChange: () => void;
}

interface SingleCommentProps {
  comment: CommentDetail;
  postId: string;
  postAuthorId?: string;
  currentUserId?: string;
  isAccepted: boolean;
  depth: number;
  onChange: () => void;
}

export function CommentThread({
  comments,
  postId,
  postAuthorId,
  currentUserId,
  acceptedCommentId,
  onChange,
}: CommentThreadProps) {
  return (
    <ul className="flex flex-col gap-4" role="list" aria-label="Comments">
      {comments.map((comment) => (
        <SingleComment
          key={comment.id}
          comment={comment}
          postId={postId}
          postAuthorId={postAuthorId}
          currentUserId={currentUserId}
          isAccepted={acceptedCommentId === comment.id}
          depth={0}
          onChange={onChange}
        />
      ))}
    </ul>
  );
}

function SingleComment({
  comment,
  postId,
  postAuthorId,
  currentUserId,
  isAccepted,
  depth,
  onChange,
}: SingleCommentProps) {
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState('');
  const [editBody, setEditBody] = React.useState(comment.content);
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(comment.upvotes);
  const [submitting, setSubmitting] = React.useState(false);

  const isAuthor = currentUserId === comment.authorId;
  const isDeleted = comment.status === 'deleted';
  const canEdit =
    (isAuthor && withinEditWindow(comment.createdAt)) || currentUserId === postAuthorId || false;
  const canDelete = isAuthor || currentUserId === postAuthorId || false;
  const canAccept =
    currentUserId === postAuthorId && !comment.parentCommentId && !isAccepted && !isDeleted;

  const handleLike = async () => {
    if (!currentUserId) return;
    const previous = likeCount;
    setLiked((l) => !l);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    try {
      const res = await fetch('/api/v1/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'comment', targetId: comment.id, reactionType: 'like' }),
      });
      if (!res.ok) throw new Error('Like failed');
      const json = (await res.json()) as { data?: { removed?: boolean; id?: string } };
      const removed = json.data?.removed ?? !json.data?.id;
      setLiked(!removed);
      setLikeCount(removed ? previous : previous + 1);
    } catch {
      setLiked((l) => !l);
      setLikeCount(previous);
    }
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: replyBody, parentCommentId: comment.id }),
      });
      if (!res.ok) throw new Error('Reply failed');
      trackEvent('first_comment', { postId, parentCommentId: comment.id });
      setReplyBody('');
      setReplyOpen(false);
      onChange();
    } catch (err: any) {
      alert(err.message || 'Reply failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: editBody }),
      });
      if (!res.ok) throw new Error('Edit failed');
      setEditing(false);
      onChange();
    } catch (err: any) {
      alert(err.message || 'Edit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this comment? Replies will remain with a placeholder.')) return;
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      onChange();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const acceptSolution = async () => {
    if (!confirm('Mark this as the accepted solution? The author will receive reputation points.')) return;
    try {
      const res = await fetch(`/api/v1/posts/${postId}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id }),
      });
      if (!res.ok) throw new Error('Accept failed');
      onChange();
    } catch (err: any) {
      alert(err.message || 'Accept failed');
    }
  };

  const inner = isDeleted ? (
    <p className="text-sm italic text-muted-foreground">[deleted]</p>
  ) : editing ? (
    <form onSubmit={submitEdit} className="flex flex-col gap-2">
      <RichTextEditor
        value={editBody}
        onChange={(html) => setEditBody(html)}
        placeholder="Edit your comment..."
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>Save</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  ) : (
    <div
      className="prose prose-sm max-w-none text-foreground"
      dangerouslySetInnerHTML={{ __html: comment.content }}
    />
  );

  return (
    <li className={`flex gap-3 ${depth > 0 ? 'ml-8 border-l-2 border-border pl-3' : ''}`} role="listitem">
      <Link href={`/u/${comment.author.userslug}`}>
        <Avatar
          src={comment.author.pictureUrl ?? undefined}
          alt={comment.author.username}
          fallback={comment.author.fullName || comment.author.username}
          size="sm"
        />
      </Link>

      <div className="flex-1">
        <div className={`rounded-xl border p-4 ${isAccepted ? 'border-emerald-500 bg-emerald-50/50' : 'border-border bg-surface'}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Link href={`/u/${comment.author.userslug}`} className="font-medium hover:text-primary">
                {comment.author.username}
              </Link>
              <span className="text-muted-foreground">
                {comment.author.reputationScore} pts · {timeAgo(comment.createdAt)}
              </span>
              {isAccepted ? (
                <Badge variant="emerald" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Accepted solution
                </Badge>
              ) : null}
            </div>

            {canEdit || canDelete || canAccept ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Comment actions">
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="z-50 min-w-[160px] rounded-xl border border-border bg-surface p-1 shadow-lg">
                    {canAccept ? (
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={acceptSolution}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-muted"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          Accept solution
                        </button>
                      </DropdownMenu.Item>
                    ) : null}
                    {canEdit ? (
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </button>
                      </DropdownMenu.Item>
                    ) : null}
                    {canDelete ? (
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-error outline-none hover:bg-muted"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </button>
                      </DropdownMenu.Item>
                    ) : null}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : null}
          </div>

          {inner}

          {!isDeleted && !editing ? (
            <div className="mt-3 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={liked ? 'Unlike' : 'Like'}
                aria-pressed={liked}
                onClick={handleLike}
                disabled={!currentUserId}
                className="gap-1"
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} aria-hidden="true" />
                <span className="text-xs">{likeCount}</span>
              </Button>

              {depth === 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setReplyOpen((r) => !r)}
                  disabled={!currentUserId}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs">Reply</span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {replyOpen && depth === 0 ? (
          <form onSubmit={submitReply} className="mt-2 flex flex-col gap-2">
            <RichTextEditor
              value={replyBody}
              onChange={(html) => setReplyBody(html)}
              placeholder="Write a reply..."
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>Post reply</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setReplyOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {comment.replies && comment.replies.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-4" role="list">
            {comment.replies.map((reply) => (
              <SingleComment
                key={reply.id}
                comment={reply}
                postId={postId}
                postAuthorId={postAuthorId}
                currentUserId={currentUserId}
                isAccepted={false}
                depth={depth + 1}
                onChange={onChange}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function withinEditWindow(createdAt: string): boolean {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  return elapsed <= 15 * 60 * 1000;
}
