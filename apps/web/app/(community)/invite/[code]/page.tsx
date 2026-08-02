import Link from 'next/link';
import { CheckCircle2, AlertCircle, Clock, Lock } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { createServiceDb } from '@/lib/db';
import { getSession } from '@/lib/auth/server';
import { getInviteForRedemption } from '@/lib/services/groups';
import { InviteRedemptionCard } from '../../components/InviteRedemptionCard';

// T8.9 (spec §5.5/521): invite-link redemption. One bounded service call
// (getInviteForRedemption runs invite → group → membership sequentially) — no
// feed waves, so the pool budget is untouched. The page renders a state per the
// invite's validity and the viewer's session; the actual join happens through
// the existing accept-invite endpoint via InviteRedemptionCard.
export default async function InviteRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = createServiceDb();
  const { session } = await getSession();
  const invite = await getInviteForRedemption(db, code, session?.user?.id);

  if (!invite) {
    return (
      <Frame icon={<AlertCircle className="h-7 w-7 text-[var(--pm-danger)]" />} title="Invite link not found">
        <p className="text-sm text-[var(--pm-muted)]">
          This invite link is invalid or has been removed. Ask a member for a new one.
        </p>
        <BackToFeed />
      </Frame>
    );
  }

  const { group } = invite;

  // Not logged in: show what they're joining and prompt sign-in, redirecting back.
  if (!session) {
    return (
      <Frame
        icon={<Lock className="h-7 w-7 text-[var(--pm-coral-dark)]" />}
        title={`You're invited to ${group.name}`}
      >
        <p className="text-sm text-[var(--pm-muted)]">
          {group.description ?? 'Join this circle to take part in the conversation.'}
        </p>
        <p className="text-sm text-[var(--pm-muted)]">{group.memberCount.toLocaleString()} members</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/login?returnUrl=${encodeURIComponent(`/invite/${code}`)}`}>Sign in to join</Link>
          </Button>
          <BackToFeed variant="secondary" />
        </div>
      </Frame>
    );
  }

  if (invite.alreadyMember) {
    return (
      <Frame
        icon={<CheckCircle2 className="h-7 w-7 text-[var(--pm-green)]" />}
        title={`You're already a member of ${group.name}`}
      >
        <p className="text-sm text-[var(--pm-muted)]">You joined this circle previously.</p>
        <Button asChild>
          <Link href={`/g/${group.slug}`}>Go to circle</Link>
        </Button>
      </Frame>
    );
  }

  if (invite.expired) {
    return (
      <Frame icon={<Clock className="h-7 w-7 text-[var(--pm-danger)]" />} title="Invite link expired">
        <p className="text-sm text-[var(--pm-muted)]">
          This invite link has passed its expiry date. Ask a member for a new one.
        </p>
        <BackToFeed />
      </Frame>
    );
  }

  if (invite.fullyRedeemed) {
    return (
      <Frame icon={<AlertCircle className="h-7 w-7 text-[var(--pm-danger)]" />} title="Invite link fully used">
        <p className="text-sm text-[var(--pm-muted)]">
          This invite link has reached its use limit and can no longer be redeemed.
        </p>
        <BackToFeed />
      </Frame>
    );
  }

  return (
    <Frame
      icon={<Lock className="h-7 w-7 text-[var(--pm-coral-dark)]" />}
      title={`You're invited to ${group.name}`}
    >
      <p className="text-sm text-[var(--pm-muted)]">
        {group.description ?? 'Join this circle to take part in the conversation.'}
      </p>
      <p className="text-sm text-[var(--pm-muted)]">
        {group.memberCount.toLocaleString()} members
        {invite.role && invite.role !== 'member' ? ` · joining as ${invite.role}` : ''}
      </p>
      <InviteRedemptionCard slug={group.slug} code={invite.code} groupName={group.name} role={invite.role} />
    </Frame>
  );
}

function Frame({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-8 shadow-[var(--pm-shadow)]">
        <div className="mb-4 flex items-center gap-3">
          {icon}
          <h1 className="font-serif text-2xl font-semibold text-[var(--pm-ink)]">{title}</h1>
        </div>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

function BackToFeed({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  return (
    <Button asChild variant={variant}>
      <Link href="/feed">Back to feed</Link>
    </Button>
  );
}