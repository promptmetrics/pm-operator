'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart, MessageSquare, CheckCircle2, Pencil, Trash2, MoreHorizontal, Flag } from 'lucide-react';
import { type Editor } from '@pm-operator/ui/editor/RichTextEditor';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@pm-operator/ui/components/Button';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { useToast } from '@pm-operator/ui/components/Toast';
import { RichTextEditor } from '@pm-operator/ui/editor/RichTextEditor';
import { timeAgo } from '@/lib/format';
import { trackEvent } from '@/lib/analytics';
import { apiErrorMessage } from '@/lib/api/client-errors';
import { FlagDialog } from './FlagDialog';
import { POINT_WEIGHTS } from '@pm-operator/api';
import type { CommentDetail } from '@pm-operator/api';

interface CommentThreadProps {
  comments: CommentDetail[];
  postId: string;
  postAuthorId?: string;
  currentUserId?: string;
  acceptedCommentId?: string | null;
  /** Whether the viewer is a member of the circle this post belongs to. */
  viewerIsMember?: boolean;
  /** Circle to join in order to engage with comments. */
  group?: { slug: string; name: string; color: string | null };
  onChange: () => void;
}

interface SingleCommentProps {
  comment: CommentDetail;
  postId: string;
  postAuthorId?: string;
  currentUserId?: string;
  isAccepted: boolean;
  depth: number;
  /** Whether the viewer is a member of the circle this post belongs to. */
  viewerIsMember?: boolean;
  /** Circle to join in order to engage with comments. */
  group?: { slug: string; name: string; color: string | null };
  onChange: () => void;
}

export function CommentThread({
  comments,
  postId,
  postAuthorId,
  currentUserId,
  acceptedCommentId,
  viewerIsMember,
  group,
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
          viewerIsMember={viewerIsMember}
          group={group}
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
  viewerIsMember,
  group,
  onChange,
}: SingleCommentProps) {
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState('');
  const [editBody, setEditBody] = React.useState(comment.content);
  const [liked, setLiked] = React.useState(Boolean(comment.viewerHasLiked));
  const [likeCount, setLikeCount] = React.useState(comment.upvotes);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmAccept, setConfirmAccept] = React.useState(false);
  const { toast } = useToast();

  const isAuthor = currentUserId === comment.authorId;
  const isDeleted = comment.status === 'deleted';
  const canEdit =
    (isAuthor && withinEditWindow(comment.createdAt)) || currentUserId === postAuthorId || false;
  const canDelete = isAuthor || currentUserId === postAuthorId || false;
  const canAccept =
    currentUserId === postAuthorId && !comment.parentCommentId && !isAccepted && !isDeleted;

  const handleLike = async () => {
    if (!currentUserId || !viewerIsMember) return;
    const previous = likeCount;
    setLiked((l) => !l);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    try {
      const res = await fetch('/api/v1/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'comment', targetId: comment.id, reactionType: 'like' }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Like failed'));
      const json = (await res.json()) as { data?: { removed?: boolean; id?: string } };
      const removed = json.data?.removed ?? !json.data?.id;
      setLiked(!removed);
      setLikeCount(removed ? previous - 1 : previous + 1);
    } catch (err: any) {
      setLiked((l) => !l);
      setLikeCount(previous);
      toast({ title: err.message || 'Like failed', variant: 'error' });
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
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Reply failed'));
      trackEvent('first_comment', { postId, parentCommentId: comment.id });
      setReplyBody('');
      setReplyOpen(false);
      onChange();
    } catch (err: any) {
      toast({ title: err.message || 'Reply failed', variant: 'error' });
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
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Edit failed'));
      setEditing(false);
      onChange();
    } catch (err: any) {
      toast({ title: err.message || 'Edit failed', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Delete failed'));
      onChange();
    } catch (err: any) {
      toast({ title: err.message || 'Delete failed', variant: 'error' });
    }
  };

  const acceptSolution = async () => {
    try {
      const res = await fetch(`/api/v1/posts/${postId}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Accept failed'));
      onChange();
    } catch (err: any) {
      toast({ title: err.message || 'Accept failed', variant: 'error' });
    }
  };

  const uploadImage = async (file: File, editor: Editor) => {
    setUploadingImage(true);
    try {
      const res = await fetch('/api/v1/uploads/post-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const errJson = (await res.json()) as { error?: { message?: string } };
        throw new Error(errJson.error?.message || 'Failed to start upload');
      }
      const { uploadUrl, path } = (await res.json()) as { uploadUrl: string; path: string };
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Failed to upload image');
      editor.chain().focus().setImage({ src: path, alt: file.name }).run();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to upload image', variant: 'error' });
    } finally {
      setUploadingImage(false);
    }
  };

  const inner = isDeleted ? (
    <p className="text-sm italic text-[var(--pm-muted)]">[deleted]</p>
  ) : editing ? (
    <form onSubmit={submitEdit} className="flex flex-col gap-2">
      {uploadingImage ? <p className="text-xs text-[var(--pm-muted)]">Uploading image…</p> : null}
      <RichTextEditor
        value={editBody}
        onChange={(html) => setEditBody(html)}
        placeholder="Edit your comment..."
        onImageUpload={uploadImage}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting || uploadingImage}>Save</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  ) : (
    <div
      className="prose prose-sm max-w-none text-[var(--pm-ink)]"
      dangerouslySetInnerHTML={{ __html: comment.content }}
    />
  );

  return (
    <li className={`flex gap-3 ${depth > 0 ? 'ml-8 border-l-2 border-[var(--pm-line)] pl-3' : ''}`} role="listitem">
      <Link href={`/u/${comment.author.userslug}`}>
        <Avatar
          src={comment.author.pictureUrl ?? undefined}
          alt={comment.author.username}
          fallback={comment.author.fullName || comment.author.username}
          size="sm"
          badge={<LevelBadge level={comment.author.level} size="xs" />}
        />
      </Link>

      <div className="flex-1">
        <div className={`rounded-xl border p-4 ${isAccepted ? 'border-[var(--pm-green)] bg-[var(--pm-green-bg)]/50' : 'border-[var(--pm-line)] bg-[var(--pm-paper-inset)]'}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Link href={`/u/${comment.author.userslug}`} className="font-medium hover:text-[var(--pm-coral-dark)]">
                {comment.author.username}
              </Link>
              {postAuthorId && comment.authorId === postAuthorId ? (
                <span className="rounded-[var(--pm-radius-pill)] bg-[var(--pm-coral-tint)] px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--pm-coral-dark)]">
                  OP
                </span>
              ) : null}
              <span className="text-[var(--pm-muted)]">
                {comment.author.reputationScore} pts · {timeAgo(comment.createdAt)}
              </span>
              {isAccepted ? (
                <Badge variant="green" className="gap-1">
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
                  <DropdownMenu.Content className="z-50 min-w-[160px] rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-1 shadow-lg">
                    {canAccept ? (
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={() => setConfirmAccept(true)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-[var(--pm-paper-2)]"
                        >
                          <CheckCircle2 className="h-4 w-4 text-[var(--pm-green)]" aria-hidden="true" />
                          Accept solution
                        </button>
                      </DropdownMenu.Item>
                    ) : null}
                    {canEdit ? (
                      <DropdownMenu.Item asChild>
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-[var(--pm-paper-2)]"
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
                          onClick={() => setConfirmDelete(true)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--pm-danger)] outline-none hover:bg-[var(--pm-paper-2)]"
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
                disabled={!currentUserId || !viewerIsMember}
                title={!currentUserId ? 'Sign in to like' : !viewerIsMember ? 'Join the circle to like' : undefined}
                className="gap-1"
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-[var(--pm-coral)] text-[var(--pm-coral)]' : ''}`} aria-hidden="true" />
                <span className="text-xs">{likeCount}</span>
              </Button>

              {depth === 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setReplyOpen((r) => !r)}
                  disabled={!currentUserId || !viewerIsMember}
                  title={!currentUserId ? 'Sign in to reply' : !viewerIsMember ? 'Join the circle to reply' : undefined}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs">Reply</span>
                </Button>
              ) : null}

              {currentUserId && !isAuthor ? (
                <FlagDialog targetType="comment" targetId={comment.id}>
                  <Button variant="ghost" size="sm" className="gap-1" aria-label="Flag comment">
                    <Flag className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs">Flag</span>
                  </Button>
                </FlagDialog>
              ) : null}
            </div>
          ) : null}
        </div>

        {replyOpen && depth === 0 && viewerIsMember ? (
          <form onSubmit={submitReply} className="mt-2 flex flex-col gap-2">
            {uploadingImage ? <p className="text-xs text-[var(--pm-muted)]">Uploading image…</p> : null}
            <RichTextEditor
              value={replyBody}
              onChange={(html) => setReplyBody(html)}
              placeholder="Write a reply..."
              onImageUpload={uploadImage}
            />
            {!viewerIsMember ? (
              <p className="rounded-lg border border-[var(--pm-amber)] bg-[var(--pm-amber-bg)]/30 p-2 text-xs text-[var(--pm-ink-2)]">
                Join <Link href={`/g/${group?.slug}`} className="font-semibold hover:underline" style={{ color: group?.color ?? 'var(--pm-coral-dark)' }}>{group?.name}</Link> to reply.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting || uploadingImage || !viewerIsMember}>Post reply</Button>
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
                viewerIsMember={viewerIsMember}
                group={group}
                onChange={onChange}
              />
            ))}
          </ul>
        ) : null}

        <ConfirmDialog
          destructive
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this comment?"
          description="Replies will remain with a placeholder."
          confirmLabel="Delete"
          onConfirm={handleDelete}
        />
        <ConfirmDialog
          open={confirmAccept}
          onOpenChange={setConfirmAccept}
          title="Mark this as the accepted solution?"
          description="The author will receive reputation points."
          confirmLabel="Accept"
          onConfirm={acceptSolution}
        />
      </div>
    </li>
  );
}

function withinEditWindow(createdAt: string): boolean {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  return elapsed <= 15 * 60 * 1000;
}

interface AcceptedSolutionCardProps {
  comment: CommentDetail;
  postId: string;
  postAuthorId?: string;
  currentUserId?: string;
  /** Whether the viewer is a member of the circle this post belongs to. */
  viewerIsMember?: boolean;
  /** Circle to join in order to engage with comments. */
  group?: { slug: string; name: string; color: string | null };
  onChange: () => void;
}

/**
 * The accepted solution hoisted above the thread as a standalone card
 * (design Post.dc.html; 07-ux-spec:301). The comment is excluded from the
 * regular thread by the comments API; its replies render beneath the card.
 */
export function AcceptedSolutionCard({
  comment,
  postId,
  postAuthorId,
  currentUserId,
  viewerIsMember,
  group,
  onChange,
}: AcceptedSolutionCardProps) {
  const [liked, setLiked] = React.useState(Boolean(comment.viewerHasLiked));
  const [likeCount, setLikeCount] = React.useState(comment.upvotes);
  const { toast } = useToast();

  const handleLike = async () => {
    if (!currentUserId || !viewerIsMember) return;
    const previous = likeCount;
    setLiked((l) => !l);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    try {
      const res = await fetch('/api/v1/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'comment', targetId: comment.id, reactionType: 'like' }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Like failed'));
      const json = (await res.json()) as { data?: { removed?: boolean; id?: string } };
      const removed = json.data?.removed ?? !json.data?.id;
      setLiked(!removed);
      setLikeCount(removed ? previous - 1 : previous + 1);
    } catch (err: any) {
      setLiked((l) => !l);
      setLikeCount(previous);
      toast({ title: err.message || 'Like failed', variant: 'error' });
    }
  };

  return (
    <article
      aria-label="Accepted solution"
      className="rounded-xl border border-[var(--pm-green)] bg-[var(--pm-paper-inset)] p-5 shadow-[var(--pm-shadow)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-[var(--pm-radius-pill)] bg-[var(--pm-green)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--pm-on-ink)]">
          ✓ Accepted solution
        </span>
        <span className="text-xs text-[var(--pm-muted)]">
          earned +{POINT_WEIGHTS.solution_accepted} pts
        </span>
      </div>

      <div className="mb-2.5 flex items-center gap-2.5 text-sm">
        <Link href={`/u/${comment.author.userslug}`}>
          <Avatar
            src={comment.author.pictureUrl ?? undefined}
            alt={comment.author.username}
            fallback={comment.author.fullName || comment.author.username}
            size="sm"
            badge={<LevelBadge level={comment.author.level} size="xs" />}
          />
        </Link>
        <Link href={`/u/${comment.author.userslug}`} className="font-medium hover:text-[var(--pm-coral-dark)]">
          {comment.author.username}
        </Link>
        <span className="text-[var(--pm-muted)]">
          {comment.author.reputationScore} pts · {timeAgo(comment.createdAt)}
        </span>
      </div>

      <div
        className="prose prose-sm max-w-none text-[var(--pm-ink)]"
        dangerouslySetInnerHTML={{ __html: comment.content }}
      />

      <div className="mt-3 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label={liked ? 'Unlike' : 'Like'}
          aria-pressed={liked}
          onClick={handleLike}
          disabled={!currentUserId || !viewerIsMember}
          title={!currentUserId ? 'Sign in to like' : !viewerIsMember ? 'Join the circle to like' : undefined}
          className="gap-1"
        >
          <Heart
            className={`h-4 w-4 ${liked ? 'fill-[var(--pm-coral)] text-[var(--pm-coral)]' : ''}`}
            aria-hidden="true"
          />
          <span className="text-xs">{likeCount}</span>
        </Button>
      </div>

      {comment.replies && comment.replies.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-4" role="list" aria-label="Replies to the accepted solution">
          {comment.replies.map((reply) => (
            <SingleComment
              key={reply.id}
              comment={reply}
              postId={postId}
              postAuthorId={postAuthorId}
              currentUserId={currentUserId}
              isAccepted={false}
              depth={1}
              viewerIsMember={viewerIsMember}
              group={group}
              onChange={onChange}
            />
          ))}
        </ul>
      ) : null}
    </article>
  );
}
