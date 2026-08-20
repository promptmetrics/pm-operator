import Link from 'next/link';
import { CheckCircle2, Wrench, Rocket } from 'lucide-react';
import { Card } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { formatNumber } from '@/lib/format';
import { TimeAgo } from '@/components/TimeAgo';
import type { PostListItem, SearchResult } from '@pm-operator/api';

type PostItem = PostListItem | SearchResult;

interface PostRowProps {
  post: PostItem;
  onClickResult?: (postId: string) => void;
}

/**
 * Compact post row (reference: circle page / search results): type chip +
 * title + one inline meta line. No action buttons — the whole row is the
 * link to the post.
 */
export function PostRow({ post, onClickResult }: PostRowProps) {
  const isBuild = post.type === 'build';
  const isUnanswered = post.type === 'question' && !post.isSolved;

  return (
    <article aria-labelledby={`post-title-${post.id}`}>
      <Link
        href={`/g/${post.group.slug}/${post.slug}`}
        onClick={() => onClickResult?.(post.id)}
        className="group block rounded-xl focus:outline-none focus-visible:shadow-[var(--pm-focus)]"
      >
        <Card className="p-4 transition-shadow group-hover:shadow-[var(--pm-shadow-lg)]">
          <div className="flex flex-wrap items-center gap-2">
            {post.type === 'question' ? (
              <Badge variant="blue" className="gap-1">
                <Wrench className="h-3 w-3" aria-hidden="true" />
                Question
              </Badge>
            ) : null}
            {isBuild ? (
              <Badge variant="coral" className="gap-1">
                <Rocket className="h-3 w-3" aria-hidden="true" />
                Build
              </Badge>
            ) : null}
            {post.isSolved ? (
              <Badge variant="teal" className="gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Solved
              </Badge>
            ) : null}
            {isUnanswered ? <Badge variant="amber">Unanswered</Badge> : null}
          </div>
          <h2
            id={`post-title-${post.id}`}
            className="mt-2 font-serif text-[17px] font-semibold leading-snug text-[var(--pm-ink)] group-hover:text-[var(--pm-coral-dark)]"
          >
            {post.title}
          </h2>
          <p className="mt-1.5 text-xs text-[var(--pm-muted-soft)]">
            {/* Each group stays on one line; the meta wraps between groups. */}
            <span className="whitespace-nowrap">{post.author.username}</span> ·{' '}
            <span className="whitespace-nowrap">Lv {post.author.level}</span> ·{' '}
            <span className="whitespace-nowrap">{post.author.acceptedSolutions} solutions</span> ·{' '}
            <TimeAgo iso={post.createdAt} className="whitespace-nowrap" /> ·{' '}
            <span className="whitespace-nowrap">▲ {formatNumber(post.upvotes)}</span> ·{' '}
            <span className="whitespace-nowrap">💬 {formatNumber(post.commentCount)}</span>
          </p>
        </Card>
      </Link>
    </article>
  );
}
