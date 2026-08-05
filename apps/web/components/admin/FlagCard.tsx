'use client';

import * as React from 'react';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Badge } from '@pm-operator/ui/components/Badge';
import { AlertTriangle, Bot, Clock, FileText, MessageCircle, MessageSquare } from 'lucide-react';

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

const targetTypeLabels: Record<string, string> = {
  post: 'Post',
  comment: 'Comment',
  message: 'DM',
};

export function FlagCard({ flag, selected, onSelectChange }: FlagCardProps) {
  const Icon = targetTypeIcons[flag.targetType] ?? FileText;
  const label = targetTypeLabels[flag.targetType] ?? flag.targetType;

  const timeAgo = React.useMemo(() => {
    const diff = Date.now() - new Date(flag.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [flag.createdAt]);

  return (
    <Card className="border-[var(--pm-line)] bg-[var(--pm-paper-inset)]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {onSelectChange && (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={(e) => onSelectChange(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[var(--pm-line)]"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Icon className="h-3 w-3" />
                {label}
              </Badge>
              {flag.autoFlagged && (
                <Badge variant="outline" className="flex items-center gap-1 border-amber-500/30 text-amber-600 text-xs">
                  <Bot className="h-3 w-3" />
                  Auto-flagged
                </Badge>
              )}
              {flag.target.group && (
                <span className="text-xs text-[var(--pm-muted)]">
                  in {flag.target.group.name}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 text-xs text-[var(--pm-muted)]">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            </div>

            {/* Author */}
            <p className="text-sm text-[var(--pm-muted)]">
              by{' '}
              <span className="font-medium text-[var(--pm-ink)]">
                {flag.target.author.username}
              </span>
              {flag.reporter && (
                <> &middot; reported by <span className="font-medium text-[var(--pm-ink)]">{flag.reporter.username}</span></>
              )}
            </p>

            {/* Title */}
            {flag.target.title && (
              <p className="font-medium text-sm">{flag.target.title}</p>
            )}

            {/* Content preview */}
            {flag.target.content && (
              <div className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper)] p-3 text-sm">
                {flag.targetType === 'message' ? (
                  <p className="whitespace-pre-wrap break-words">
                    {flag.target.content.length > 200
                      ? `${flag.target.content.slice(0, 200)}...`
                      : flag.target.content}
                  </p>
                ) : (
                  <div
                    className="[&_*]:break-words [&_img]:max-h-32 [&_img]:rounded"
                    dangerouslySetInnerHTML={{
                      __html:
                        flag.target.content.length > 200
                          ? `${flag.target.content.slice(0, 200)}...`
                          : flag.target.content,
                    }}
                  />
                )}
              </div>
            )}

            {/* Reason */}
            {flag.reason && (
              <div className="flex items-start gap-1.5 text-sm text-[var(--pm-muted)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{flag.reason}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
