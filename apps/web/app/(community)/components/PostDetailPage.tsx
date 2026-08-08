'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Bookmark, Flag, MoreHorizontal, Pencil, Pin, Star, Trash2, X } from 'lucide-react';
import { FlagDialog } from './FlagDialog';
import { Button } from '@pm-operator/ui/components/Button';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Input } from '@pm-operator/ui/components/Input';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { LevelBadge } from '@pm-operator/ui/components/LevelBadge';
import { Tag } from '@pm-operator/ui/components/Tag';
import { Select } from '@pm-operator/ui/components/Select';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@pm-operator/ui/components/DropdownMenu';
import { useToast } from '@pm-operator/ui/components/Toast';
import { RichTextEditor } from '@pm-operator/ui/editor/RichTextEditor';
import { CommentThread, AcceptedSolutionCard } from './CommentThread';
import { GroupMembershipButton } from './GroupMembershipButton';
import { useRealtimePost } from './RealtimeProvider';
import { timeAgo } from '@/lib/format';
import { trackEvent } from '@/lib/analytics';
import { apiErrorMessage } from '@/lib/api/client-errors';
import { POINT_WEIGHTS } from '@pm-operator/api';
import type { PostDetail, CommentDetail, CommentSort, PostListItem } from '@pm-operator/api';

const PAGE_SIZE = 20;

const pillClass =
  'inline-flex items-center gap-1.5 rounded-[var(--pm-radius-pill)] border bg-[var(--pm-paper)] px-3.5 py-1.5 text-[13px] transition-colors focus:outline-none focus-visible:shadow-[var(--pm-focus)] disabled:pointer-events-none disabled:opacity-60';

const pillIdle =
  'border-[var(--pm-line)] text-[var(--pm-muted)] hover:border-[var(--pm-coral)] hover:text-[var(--pm-coral-dark)]';

const pillActive = 'border-[var(--pm-coral)] text-[var(--pm-coral-dark)]';

const railCardClass =
  'rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]';

interface ViewerSummary {
  username: string;
  fullName: string | null;
  pictureUrl: string | null;
}

interface PostDetailPageProps {
  post: PostDetail;
  currentUserId?: string;
  viewerRole?: string;
  viewerIsMember?: boolean;
  viewer?: ViewerSummary;
  morePosts?: PostListItem[];
}

const typeLabel: Record<string, string> = {
  question: 'Question',
  build: 'Build',
  discussion: 'Discussion',
  lesson: 'Lesson',
};

const typeChipColor: Record<string, string> = {
  question: 'text-[var(--pm-blue,#2f5675)]',
  build: 'text-[var(--pm-coral-dark)]',
  discussion: 'text-[var(--pm-ink-2)]',
  lesson: 'text-[var(--pm-ink-2)]',
};

export function PostDetailPage({
  post,
  currentUserId,
  viewerRole,
  viewerIsMember = false,
  viewer,
  morePosts = [],
}: PostDetailPageProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Post state (title/content are local so the edit dialog can update in place).
  const [postTitle, setPostTitle] = React.useState(post.title);
  const [postContent, setPostContent] = React.useState(post.content);
  const [liked, setLiked] = React.useState(Boolean(post.viewerHasLiked));
  const [likeCount, setLikeCount] = React.useState(post.upvotes);
  const [bookmarked, setBookmarked] = React.useState(Boolean(post.viewerHasBookmarked));
  const [bookmarking, setBookmarking] = React.useState(false);
  const [pinned, setPinned] = React.useState(post.isPinned);
  const [featuredLabel, setFeaturedLabel] = React.useState(post.featuredLabel);
  const [savingAdmin, setSavingAdmin] = React.useState(false);

  // Comments state (T5.6: sorted + paged root comments; accepted hoisted).
  const [comments, setComments] = React.useState<CommentDetail[]>([]);
  const [acceptedComment, setAcceptedComment] = React.useState<CommentDetail | null>(null);
  const [sort, setSort] = React.useState<CommentSort>('top');
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // Composer (T5.8: collapsed pill → TipTap editor).
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // Dialogs.
  const [editOpen, setEditOpen] = React.useState(false);
  const [featureOpen, setFeatureOpen] = React.useState(false);
  const [confirmDeletePost, setConfirmDeletePost] = React.useState(false);
  const flagTriggerRef = React.useRef<HTMLButtonElement>(null);

  const isGlobalAdmin = viewerRole === 'admin';
  const isAuthor = currentUserId === post.authorId;
  const canManagePost = isAuthor || isGlobalAdmin;
  const acceptedId = acceptedComment?.id ?? post.acceptedCommentId;

  const commentsRef = React.useRef<CommentDetail[]>(comments);
  commentsRef.current = comments;

  const fetchPage = React.useCallback(
    async (sortValue: CommentSort, limit: number, offset: number) => {
      const res = await fetch(
        `/api/v1/posts/${post.id}/comments?sort=${sortValue}&limit=${limit}&offset=${offset}`
      );
      if (!res.ok) throw new Error('Failed to load comments');
      const json = (await res.json()) as {
        data?: { comments?: CommentDetail[]; acceptedComment?: CommentDetail | null };
        meta?: { hasMore?: boolean };
      };
      return {
        comments: json.data?.comments ?? [],
        acceptedComment: json.data?.acceptedComment ?? null,
        hasMore: Boolean(json.meta?.hasMore),
      };
    },
    [post.id]
  );

  const loadComments = React.useCallback(async () => {
    try {
      // Refresh everything currently on screen (at least one page, capped by the API).
      const limit = Math.min(Math.max(commentsRef.current.length, PAGE_SIZE), 100);
      const page = await fetchPage(sort, limit, 0);
      setComments(page.comments);
      setAcceptedComment(page.acceptedComment);
      setHasMore(page.hasMore);
    } catch {
      // leave existing comments
    }
  }, [fetchPage, sort]);

  React.useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Deep-link anchors (moderation queue comment flags, T2F.2): comments load
  // asynchronously, so the browser's native fragment scroll runs before any
  // #comment-* element exists. Scroll manually once the target is rendered.
  // Limitation: only the first page of root comments loads, so a flagged
  // comment beyond the loaded window won't be in the DOM and the anchor
  // silently no-ops (fetch-by-comment is Phase 3 scope).
  const anchorScrolledRef = React.useRef(false);
  React.useEffect(() => {
    if (anchorScrolledRef.current) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#comment-')) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    anchorScrolledRef.current = true;
    el.scrollIntoView();
  }, [comments, acceptedComment]);

  useRealtimePost(() => {
    // A new comment arrived; refetch to get nested structure and author details.
    loadComments();
  }, post.id);

  const showMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(sort, PAGE_SIZE, commentsRef.current.length);
      setComments((prev) => [...prev, ...page.comments]);
      setHasMore(page.hasMore);
    } catch {
      toast({ title: 'Failed to load more comments', variant: 'error' });
    } finally {
      setLoadingMore(false);
    }
  };

  const shownCount =
    comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0) +
    (acceptedComment ? 1 + (acceptedComment.replies?.length ?? 0) : 0);
  const moreCount = Math.min(PAGE_SIZE, Math.max(post.commentCount - shownCount, 1));

  const patchPost = async (patch: {
    isPinned?: boolean;
    featuredLabel?: string | null;
    title?: string;
    content?: string;
  }) => {
    setSavingAdmin(true);
    try {
      const res = await fetch(`/api/v1/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Update failed'));
      return true;
    } catch (err: any) {
      toast({ title: err.message || 'Update failed', variant: 'error' });
      return false;
    } finally {
      setSavingAdmin(false);
    }
  };

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
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Comment failed'));
      trackEvent('first_comment', { postId: post.id });
      setBody('');
      setComposerOpen(false);
      loadComments();
    } catch (err: any) {
      toast({ title: err.message || 'Comment failed', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async () => {
    if (!currentUserId || !viewerIsMember) return;
    const previous = likeCount;
    setLiked((l) => !l);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    try {
      const res = await fetch('/api/v1/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: post.id, reactionType: 'like' }),
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

  const handleBookmark = async () => {
    if (!currentUserId || bookmarking) return;
    setBookmarking(true);
    const previous = bookmarked;
    setBookmarked(!previous);
    try {
      const res = await fetch('/api/v1/bookmarks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Bookmark failed'));
      const json = (await res.json()) as { data?: { bookmarked?: boolean } };
      setBookmarked(Boolean(json.data?.bookmarked));
    } catch {
      setBookmarked(previous);
      toast({ title: 'Bookmark failed', variant: 'error' });
    } finally {
      setBookmarking(false);
    }
  };

  // D10: navigator.share with copy-link fallback + toast.
  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: postTitle, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'error' });
    }
  };

  const handleDeletePost = async () => {
    const res = await fetch(`/api/v1/posts/${post.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: await apiErrorMessage(res, 'Delete failed'), variant: 'error' });
      return;
    }
    toast({ title: 'Post deleted' });
    router.push('/feed');
  };

  const togglePin = async () => {
    if (savingAdmin) return;
    const next = !pinned;
    if (await patchPost({ isPinned: next })) {
      setPinned(next);
      toast({ title: next ? 'Post pinned' : 'Post unpinned' });
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_296px] lg:items-start">
      <main className="flex min-w-0 flex-col gap-4">
        <nav aria-label="Breadcrumb" className="text-[13px] text-[var(--pm-muted)]">
          <Link href="/feed" className="hover:text-[var(--pm-coral-dark)]">
            Feed
          </Link>
          <span className="mx-1" aria-hidden="true">
            /
          </span>
          <Link
            href={`/g/${post.group.slug}`}
            className="font-semibold"
            style={{ color: post.group.color ?? 'var(--pm-ink-2)' }}
          >
            {post.group.name}
          </Link>
        </nav>

        <article className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6 shadow-[var(--pm-shadow)]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-[var(--pm-radius-pill)] bg-[var(--pm-paper-2)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${typeChipColor[post.type] ?? 'text-[var(--pm-ink-2)]'}`}
            >
              {typeLabel[post.type] ?? post.type}
            </span>
            {acceptedId ? (
              <span className="rounded-[var(--pm-radius-pill)] bg-[var(--pm-green-bg)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--pm-green)]">
                ✓ Solved
              </span>
            ) : null}
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
          </div>

          <h1 className="mb-3.5 font-serif text-2xl font-semibold leading-tight sm:text-3xl">
            {postTitle}
          </h1>

          {post.coverImageUrl ? (
            <img
              src={post.coverImageUrl}
              alt="Featured image"
              className="mb-4 max-h-[420px] w-full rounded-lg border border-[var(--pm-line)] object-cover"
            />
          ) : null}

          <div className="mb-4 flex items-center gap-2.5 text-[13px] text-[var(--pm-muted)]">
            <Link href={`/u/${post.author.userslug}`}>
              <Avatar
                src={post.author.pictureUrl ?? undefined}
                alt={post.author.username}
                fallback={post.author.fullName || post.author.username}
                size="sm"
                badge={<LevelBadge level={post.author.level} size="xs" />}
              />
            </Link>
            <Link
              href={`/u/${post.author.userslug}`}
              className="font-semibold text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
            >
              {post.author.username}
            </Link>
            <span>
              {post.author.reputationScore} pts · {post.author.acceptedSolutions} solutions ·{' '}
              {timeAgo(post.createdAt)}
            </span>
          </div>

          <div
            className="prose prose-sm max-w-none text-[var(--pm-ink)]"
            dangerouslySetInnerHTML={{ __html: postContent }}
          />

          {post.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          ) : null}

          {!viewerIsMember && currentUserId ? (
            <div className="rounded-lg border border-[var(--pm-amber)] bg-[var(--pm-amber-bg)]/30 p-3 text-sm text-[var(--pm-ink-2)]">
              Join <Link href={`/g/${post.group.slug}`} className="font-semibold hover:underline" style={{ color: post.group.color ?? 'var(--pm-coral-dark)' }}>{post.group.name}</Link> to like or comment on this post.
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-[var(--pm-line)] pt-4">
            <button
              type="button"
              onClick={handleLike}
              disabled={!currentUserId || !viewerIsMember}
              aria-pressed={liked}
              className={`${pillClass} font-bold ${liked ? pillActive : 'border-[var(--pm-line)] text-[var(--pm-ink-2)] hover:border-[var(--pm-coral)] hover:text-[var(--pm-coral-dark)]'}`}
            >
              <span aria-hidden="true">▲</span> {likeCount}
              <span className="sr-only">upvotes</span>
            </button>

            {currentUserId ? (
              <button
                type="button"
                onClick={handleBookmark}
                disabled={bookmarking}
                aria-pressed={bookmarked}
                className={`${pillClass} ${bookmarked ? pillActive : pillIdle}`}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${bookmarked ? 'fill-[var(--pm-coral)] text-[var(--pm-coral)]' : ''}`}
                  aria-hidden="true"
                />
                {bookmarked ? 'Bookmarked' : 'Bookmark'}
              </button>
            ) : null}

            <button type="button" onClick={handleShare} className={`${pillClass} ${pillIdle}`}>
              Share
            </button>

            {currentUserId ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Post actions"
                    className={`${pillClass} ${pillIdle} px-2.5`}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => setTimeout(() => flagTriggerRef.current?.click(), 0)}
                  >
                    <Flag className="h-4 w-4" aria-hidden="true" />
                    Flag
                  </DropdownMenuItem>
                  {canManagePost ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-[var(--pm-danger)]"
                        onSelect={() => setConfirmDeletePost(true)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {isGlobalAdmin ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={togglePin}>
                        <Pin className="h-4 w-4" aria-hidden="true" />
                        {pinned ? 'Unpin' : 'Pin'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setFeatureOpen(true)}>
                        <Star className="h-4 w-4" aria-hidden="true" />
                        {featuredLabel ? 'Edit feature…' : 'Feature…'}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <span className="ml-auto text-[13px] text-[var(--pm-muted)]">
              {post.commentCount} comments
            </span>
          </div>
        </article>

        {acceptedComment ? (
          <AcceptedSolutionCard
            comment={acceptedComment}
            postId={post.id}
            postAuthorId={post.authorId}
            currentUserId={currentUserId}
            viewerIsMember={viewerIsMember}
            group={post.group}
            onChange={loadComments}
          />
        ) : null}

        <section
          aria-label="Comments"
          className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-5 shadow-[var(--pm-shadow)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold">{post.commentCount} comments</h2>
            <Select
              aria-label="Sort comments"
              value={sort}
              onChange={(e) => setSort(e.target.value as CommentSort)}
              className="h-8 w-24 py-0 text-sm"
            >
              <option value="top">Top</option>
              <option value="new">New</option>
            </Select>
          </div>

          {currentUserId ? (
            <div className="mb-5">
              {!viewerIsMember ? (
                <p className="rounded-lg border border-[var(--pm-amber)] bg-[var(--pm-amber-bg)]/30 p-3 text-sm text-[var(--pm-ink-2)]">
                  Join <Link href={`/g/${post.group.slug}`} className="font-semibold hover:underline" style={{ color: post.group.color ?? 'var(--pm-coral-dark)' }}>{post.group.name}</Link> to leave a comment.
                </p>
              ) : !composerOpen && !body.trim() ? (
                <div className="flex items-center gap-3">
                  <Avatar
                    src={viewer?.pictureUrl ?? undefined}
                    alt={viewer?.username ?? 'Your avatar'}
                    fallback={viewer?.fullName || viewer?.username || 'You'}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() => setComposerOpen(true)}
                    className="flex-1 cursor-text rounded-[var(--pm-radius-pill)] border border-[var(--pm-line)] bg-[var(--pm-paper)] px-4 py-2 text-left text-sm text-[var(--pm-muted)] transition-colors hover:border-[var(--pm-line-2)] focus:outline-none focus-visible:shadow-[var(--pm-focus)]"
                  >
                    Add a comment — +{POINT_WEIGHTS.comment_created} pts if it helps…
                  </button>
                </div>
              ) : (
                <form onSubmit={submitComment} className="flex flex-col gap-3">
                  <RichTextEditor
                    value={body}
                    onChange={(html) => setBody(html)}
                    placeholder={`Add a comment — +${POINT_WEIGHTS.comment_created} pts if it helps…`}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setComposerOpen(false);
                        setBody('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting || !body.trim()}>
                      {submitting ? 'Posting...' : 'Post comment'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          {comments.length > 0 ? (
            <CommentThread
              comments={comments}
              postId={post.id}
              postAuthorId={post.authorId}
              currentUserId={currentUserId}
              acceptedCommentId={acceptedId}
              viewerIsMember={viewerIsMember}
              group={post.group}
              onChange={loadComments}
            />
          ) : !acceptedComment ? (
            <p className="py-4 text-center text-[var(--pm-muted)]">
              No comments yet. Be the first to share your take.
            </p>
          ) : null}

          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <Button variant="ghost" size="sm" onClick={showMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : `Show ${moreCount} more comments`}
              </Button>
            </div>
          ) : null}
        </section>
      </main>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24" aria-label="About this circle">
        <div className={railCardClass}>
          <div className="mb-2 flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: post.group.color ?? 'var(--pm-coral)' }}
              aria-hidden="true"
            />
            <Link
              href={`/g/${post.group.slug}`}
              className="font-serif text-base font-semibold hover:text-[var(--pm-coral-dark)]"
            >
              {post.group.name}
            </Link>
          </div>
          {post.group.description ? (
            <p className="mb-3 text-[13px] leading-relaxed text-[var(--pm-muted)]">
              {post.group.description}
            </p>
          ) : null}
          <p className="mb-3 text-xs text-[var(--pm-muted)]">
            <strong className="font-semibold text-[var(--pm-ink-2)]">
              {post.group.memberCount}
            </strong>{' '}
            members
          </p>
          <GroupMembershipButton
            slug={post.group.slug}
            initialIsMember={viewerIsMember}
            isLoggedIn={Boolean(currentUserId)}
          />
        </div>

        {morePosts.length > 0 ? (
          <div className={railCardClass}>
            <h2 className="mb-3 font-serif text-base font-semibold">More from this circle</h2>
            <div className="flex flex-col gap-3">
              {morePosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/g/${p.group.slug}/${p.slug}`}
                  className="block text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                >
                  <span className="block text-[13px] font-semibold leading-snug">{p.title}</span>
                  <span className="block text-xs text-[var(--pm-muted)]">
                    ▲ {p.upvotes} · {p.commentCount} comments
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className={railCardClass}>
          <h2 className="mb-2.5 font-serif text-base font-semibold">How to level up</h2>
          <ul className="flex flex-col gap-2 text-[13px] text-[var(--pm-ink-2)]">
            <li className="flex items-baseline gap-2.5">
              <span className="min-w-8 font-mono text-xs font-bold text-[var(--pm-coral-dark)]">
                +{POINT_WEIGHTS.topic_created}
              </span>
              Share a build or ask a question
            </li>
            <li className="flex items-baseline gap-2.5">
              <span className="min-w-8 font-mono text-xs font-bold text-[var(--pm-coral-dark)]">
                +{POINT_WEIGHTS.comment_created}
              </span>
              Leave a helpful comment
            </li>
            <li className="flex items-baseline gap-2.5">
              <span className="min-w-8 font-mono text-xs font-bold text-[var(--pm-coral-dark)]">
                +{POINT_WEIGHTS.solution_accepted}
              </span>
              Have your answer accepted as a solution
            </li>
          </ul>
        </div>
      </aside>

      {/* Hidden trigger lets the "…" menu open the flag dialog after the menu closes. */}
      {currentUserId ? (
        <FlagDialog targetType="post" targetId={post.id}>
          <button ref={flagTriggerRef} type="button" tabIndex={-1} className="sr-only">
            Flag post
          </button>
        </FlagDialog>
      ) : null}

      <ConfirmDialog
        destructive
        open={confirmDeletePost}
        onOpenChange={setConfirmDeletePost}
        title="Delete this post?"
        description="The post will be hidden from the community. This cannot be undone from here."
        confirmLabel="Delete"
        onConfirm={handleDeletePost}
      />

      {canManagePost ? (
        <EditPostDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          postId={post.id}
          initialTitle={postTitle}
          initialContent={postContent}
          onSaved={(title, content) => {
            setPostTitle(title);
            setPostContent(content);
          }}
        />
      ) : null}

      {isGlobalAdmin ? (
        <FeatureDialog
          open={featureOpen}
          onOpenChange={setFeatureOpen}
          initialLabel={featuredLabel}
          saving={savingAdmin}
          onSave={async (label) => {
            if (await patchPost({ featuredLabel: label })) {
              setFeaturedLabel(label);
              toast({ title: label ? 'Post featured' : 'Feature cleared' });
              setFeatureOpen(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  initialTitle: string;
  initialContent: string;
  onSaved: (title: string, content: string) => void;
}

function EditPostDialog({
  open,
  onOpenChange,
  postId,
  initialTitle,
  initialContent,
  onSaved,
}: EditPostDialogProps) {
  const [title, setTitle] = React.useState(initialTitle);
  const [content, setContent] = React.useState(initialContent);
  const [saving, setSaving] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setContent(initialContent);
    }
  }, [open, initialTitle, initialContent]);

  const uploadImage = async (file: File, editor: import('@pm-operator/ui/editor/RichTextEditor').Editor) => {
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
      const json = (await res.json()) as { data?: { uploadUrl?: string; path?: string } };
      const uploadUrl = json.data?.uploadUrl;
      const path = json.data?.path;
      if (!uploadUrl || !path) {
        throw new Error('Server did not return an upload URL');
      }
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content }),
      });
      if (!res.ok) throw new Error('Update failed');
      const json = (await res.json()) as { data?: { title?: string; content?: string } };
      onSaved(json.data?.title ?? title.trim(), json.data?.content ?? content);
      toast({ title: 'Post updated' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: err.message || 'Update failed', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--pm-ink)]/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6 shadow-[var(--pm-shadow-lg)] focus:outline-none">
          <div className="flex items-center justify-between pb-4">
            <Dialog.Title className="text-lg font-semibold">Edit post</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              aria-label="Post title"
              placeholder="Post title"
              required
            />
            {uploadingImage ? <p className="text-xs text-[var(--pm-muted)]">Uploading image…</p> : null}
            <RichTextEditor
              value={content}
              onChange={(html) => setContent(html)}
              placeholder="Post content..."
              onImageUpload={uploadImage}
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={saving}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={saving || !title.trim() || !content.trim()}>
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface FeatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLabel: string | null;
  saving: boolean;
  onSave: (label: string | null) => Promise<void>;
}

function FeatureDialog({ open, onOpenChange, initialLabel, saving, onSave }: FeatureDialogProps) {
  const [label, setLabel] = React.useState(initialLabel ?? '');

  React.useEffect(() => {
    if (open) setLabel(initialLabel ?? '');
  }, [open, initialLabel]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--pm-ink)]/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--pm-radius-lg)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-6 shadow-[var(--pm-shadow-lg)] focus:outline-none">
          <Dialog.Title className="text-lg font-semibold">Feature post</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-[var(--pm-muted)]">
            The label shows on the post and in the feed, e.g. “Build of the week”.
          </Dialog.Description>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!label.trim() || saving) return;
              await onSave(label.trim());
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Feature label, e.g. Build of the week"
              maxLength={40}
              aria-label="Feature label"
            />
            <div className="flex justify-end gap-2">
              {initialLabel ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => onSave(null)}
                >
                  Clear feature
                </Button>
              ) : null}
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={saving}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={saving || !label.trim()}>
                {saving ? 'Saving...' : 'Feature'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
