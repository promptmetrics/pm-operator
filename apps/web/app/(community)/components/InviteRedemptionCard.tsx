'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';

interface InviteRedemptionCardProps {
  slug: string;
  code: string;
  groupName: string;
  role: string;
}

// T8.9: the "Join circle" action on the /invite/[code] page. Hits the existing
// accept-invite endpoint (which validates expiry / use-limit / membership
// server-side), then routes into the circle on success.
export function InviteRedemptionCard({ slug, code, groupName, role }: InviteRedemptionCardProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  const join = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/groups/${slug}/invites/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } };
        throw new Error(err.error?.message || 'Failed to join circle');
      }
      toast({ title: `You joined ${groupName}`, variant: 'success' });
      router.push(`/g/${slug}`);
    } catch (err: any) {
      toast({ title: err.message || 'Failed to join circle', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={join} disabled={loading}>
      {loading ? 'Joining…' : `Join ${groupName}`}
    </Button>
  );
}