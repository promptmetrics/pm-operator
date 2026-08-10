'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';
import { apiErrorMessage } from '@/lib/api/client-errors';

interface CircleCardActionProps {
  slug: string;
  name: string;
  visibility: string;
  initialJoined: boolean;
  isLoggedIn: boolean;
}

// Directory-card action (track 3D). Reuses the existing membership wiring:
// public join POSTs the same /membership endpoint as GroupMembershipButton;
// invite-only circles link to /g/[slug], whose gated preview (T8.9) already
// handles invite-code entry — no new request-invite endpoint.
export function CircleCardAction({
  slug,
  name,
  visibility,
  initialJoined,
  isLoggedIn,
}: CircleCardActionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [joined, setJoined] = React.useState(initialJoined);
  const [loading, setLoading] = React.useState(false);

  if (joined) {
    return (
      <span
        data-testid={`circle-joined-${slug}`}
        className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-[var(--pm-radius-pill)] border border-[var(--pm-line-2)] bg-[var(--pm-paper)] text-[13px] font-semibold text-[var(--pm-ink-2)]"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Joined
      </span>
    );
  }

  if (visibility === 'invite_only') {
    return (
      <Button
        variant="secondary"
        asChild
        className="w-full"
        data-testid={`circle-request-invite-${slug}`}
      >
        <Link href={`/g/${slug}`}>Request invite</Link>
      </Button>
    );
  }

  const join = async () => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/groups/${slug}/membership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Failed to join circle'));
      setJoined(true);
      toast({ title: `You joined ${name}`, variant: 'success' });
      router.refresh();
    } catch (err: any) {
      toast({ title: err.message || 'Something went wrong', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={join}
      disabled={loading}
      className="w-full"
      data-testid={`circle-join-${slug}`}
    >
      {loading ? 'Joining…' : 'Join circle'}
    </Button>
  );
}
