'use client';

import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge, type BadgeVariant } from '@pm-operator/ui/components/Badge';
import type {
  AdminDashboardMember,
  AdminDashboardOnboarding,
  AdminDashboardSource,
} from '@pm-operator/api';
import { timeAgo } from '@/lib/format';
import EmptyState from './EmptyState';

export interface NewestMembersProps {
  members: AdminDashboardMember[];
}

const ONBOARDING_PILL: Record<
  AdminDashboardOnboarding,
  { label: string; variant: BadgeVariant }
> = {
  onboarded: { label: 'Onboarded', variant: 'green' },
  stalled: { label: 'Stalled', variant: 'amber' },
};

const SOURCE_LABEL: Record<AdminDashboardSource, string> = {
  github: 'GitHub',
  google: 'Google',
  linkedin: 'LinkedIn',
  invite: 'Invite',
};

export default function NewestMembers({ members }: NewestMembersProps) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus className="h-8 w-8" aria-hidden="true" />}
        title="No members yet"
        message="New signups will appear here as they arrive."
        className="py-6"
      />
    );
  }

  return (
    <ul aria-label="Newest members" className="divide-y divide-[var(--pm-line)]">
      {members.map((member) => {
        const pill = ONBOARDING_PILL[member.onboarding];

        return (
          <li key={member.id}>
            <Link
              href={`/u/${member.userslug}`}
              className="flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-[var(--pm-paper-2)]"
            >
              {/* Decorative: the link already names the member in its text. */}
              <span aria-hidden="true">
                <Avatar
                  src={member.pictureUrl ?? undefined}
                  alt=""
                  fallback={member.username}
                  size="sm"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--pm-ink)]">
                  {member.username}
                </span>
                <span className="block text-xs text-[var(--pm-muted)]">
                  {SOURCE_LABEL[member.source]} &middot; joined{' '}
                  {timeAgo(member.createdAt)}
                </span>
              </span>

              <Badge variant={pill.variant} className="shrink-0">
                {pill.label}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
