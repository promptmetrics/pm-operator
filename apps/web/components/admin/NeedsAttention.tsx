'use client';

import Link from 'next/link';
import { CheckCircle2, Flag, HelpCircle, UserX, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeVariant } from '@pm-operator/ui/components/Badge';
import type {
  AdminDashboardAttentionItem,
  AdminDashboardAttentionKind,
} from '@pm-operator/api';
import { timeAgo } from '@/lib/format';
import EmptyState from './EmptyState';

export interface NeedsAttentionProps {
  items: AdminDashboardAttentionItem[];
}

interface AttentionPresentation {
  label: string;
  variant: BadgeVariant;
  icon: LucideIcon;
  /** `item.id` is a flag id, user id, or post id depending on the kind. */
  href: (id: string) => string;
}

const ATTENTION: Record<AdminDashboardAttentionKind, AttentionPresentation> = {
  open_flag: {
    label: 'Open flag',
    variant: 'coral',
    icon: Flag,
    // The queue is not addressable per flag, so this lands on the queue itself.
    href: () => '/moderation',
  },
  stalled_signup: {
    label: 'Stalled signup',
    variant: 'amber',
    icon: UserX,
    // The public profile at /u/[slug] resolves by userslug only, and the
    // attention row carries the user id — so the id-addressable admin member
    // page is the one that can actually be linked from here.
    href: (id) => `/admin/users/${id}`,
  },
  unanswered_question: {
    label: 'Unanswered',
    variant: 'blue',
    icon: HelpCircle,
    // /p/[id] permanent-redirects to the canonical /g/[circle]/[post] URL.
    href: (id) => `/p/${id}`,
  },
};

export default function NeedsAttention({ items }: NeedsAttentionProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-8 w-8" aria-hidden="true" />}
        title="Nothing needs attention"
        message="No open flags, stalled signups, or unanswered questions."
        className="py-6"
      />
    );
  }

  return (
    <ul aria-label="Needs attention" className="divide-y divide-[var(--pm-line)]">
      {items.map((item) => {
        const presentation = ATTENTION[item.kind];
        const Icon = presentation.icon;

        return (
          <li key={`${item.kind}-${item.id}`}>
            <Link
              href={presentation.href(item.id)}
              className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-[var(--pm-paper-2)]"
            >
              <Icon
                className="h-4 w-4 shrink-0 text-[var(--pm-muted)]"
                aria-hidden="true"
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--pm-ink)]">
                  {item.title}
                </span>
                <span className="block text-xs text-[var(--pm-muted)]">
                  {timeAgo(item.createdAt)}
                </span>
              </span>

              <Badge variant={presentation.variant} className="shrink-0">
                {presentation.label}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
