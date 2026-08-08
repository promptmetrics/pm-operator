'use client';

import * as React from 'react';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { Bot, Clock, FileText, MessageCircle, MessageSquare } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import {
  buildExcerpt,
  kindPill,
  outcomeBadge,
  reasonPill,
  reporterNote,
} from './flag-presentation';

export interface FlagCardFlag {
  id: string;
  targetType: 'post' | 'comment' | 'message';
  targetId: string;
  reason: string | null;
  autoFlagged: boolean;
  status: string;
  createdAt: string;
  reporter?: { id: string; username: string; userslug: string } | null;
  target: {
    id: string;
    type: string;
    title: string | null;
    content: string | null;
    author: { id: string; username: string; userslug: string };
    group?: { id: string; slug: string; name: string } | null;
    postSlug?: string | null;
  };
}

interface FlagCardProps {
  flag: FlagCardFlag;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  onAction?: (action: string) => void;
}

const targetTypeIcons: Record<string, React.ElementType> = {
  post: FileText,
  comment: MessageCircle,
  message: MessageSquare,
};

export function FlagCard({ flag, selected, onSelectChange }: FlagCardProps) {
  const Icon = targetTypeIcons[flag.targetType] ?? FileText;
  const kind = kindPill(flag.targetType);
  const reason = reasonPill(flag);
  const outcome = flag.status === 'open' ? null : outcomeBadge(flag.status);
  const note = reporterNote(flag);
  const excerpt = React.useMemo(
    () => buildExcerpt(flag.target.content, flag.targetType),
    [flag.target.content, flag.targetType]
  );

  const summaryId = `flag-${flag.id}-summary`;

  return (
    <Card
      data-testid="flag-card"
      className="border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-0"
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {onSelectChange && (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={(e) => onSelectChange(e.target.checked)}
              aria-describedby={summaryId}
              aria-label={`Select ${kind.label.toLowerCase()} flag by ${flag.target.author.username}`}
              className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--pm-line)]"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {/* Pills: kind, reason, source, outcome */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                data-testid="flag-kind"
                variant={kind.variant}
                className="flex items-center gap-1"
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {kind.label}
              </Badge>

              {reason && (
                <Badge data-testid="flag-reason" variant={reason.variant}>
                  <span className="sr-only">Reason: </span>
                  {reason.label}
                </Badge>
              )}

              {flag.autoFlagged && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Bot className="h-3 w-3" aria-hidden="true" />
                  Auto-flagged
                </Badge>
              )}

              {outcome && <Badge variant={outcome.variant}>{outcome.label}</Badge>}

              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-[var(--pm-muted)]">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {timeAgo(flag.createdAt)}
              </span>
            </div>

            {/* Who and where */}
            <p id={summaryId} className="text-sm text-[var(--pm-muted)]">
              by{' '}
              <span className="font-medium text-[var(--pm-ink)]">
                {flag.target.author.username}
              </span>
              {flag.target.group ? <> in {flag.target.group.name}</> : null}
              {flag.reporter ? (
                <>
                  {' '}
                  &middot; reported by{' '}
                  <span className="font-medium text-[var(--pm-ink)]">
                    {flag.reporter.username}
                  </span>
                </>
              ) : null}
            </p>

            {flag.target.title && (
              <p className="text-sm font-semibold text-[var(--pm-ink)]">
                {flag.target.title}
              </p>
            )}

            {/* Quoted excerpt of the flagged content */}
            {excerpt && (
              <blockquote
                data-testid="flag-excerpt"
                className="border-l-2 border-[var(--pm-coral)] bg-[var(--pm-paper)] py-2 pl-3 pr-2 text-sm italic text-[var(--pm-ink-2)]"
              >
                <span className="sr-only">Flagged content: </span>
                <span className="break-words">
                  &ldquo;{excerpt.text}
                  {excerpt.truncated ? '…' : ''}&rdquo;
                </span>
                {excerpt.truncated && <span className="sr-only"> (excerpt truncated)</span>}
              </blockquote>
            )}

            {/* The reporter's own words, when the reason carries more than a category */}
            {note && (
              <div
                data-testid="flag-note"
                className="rounded-[var(--pm-radius-md)] border border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                  {flag.autoFlagged ? 'Auto-flag detail' : 'Reporter note'}
                </p>
                <p className="mt-0.5 break-words text-sm text-[var(--pm-ink-2)]">{note}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
