'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';
import { apiErrorMessage } from '@/lib/api/client-errors';

interface GroupMembershipButtonProps {
  slug: string;
  initialIsMember: boolean;
  isLoggedIn: boolean;
  /**
   * Label shown while a member (default "Leave circle"). The accessible name
   * stays "Leave circle" so the click target is unambiguous — the redesign's
   * "✓ Joined" state is visual only.
   */
  joinedLabel?: string;
  className?: string;
}

export function GroupMembershipButton({
  slug,
  initialIsMember,
  isLoggedIn,
  joinedLabel = 'Leave circle',
  className,
}: GroupMembershipButtonProps) {
  const router = useRouter();
  const [isMember, setIsMember] = React.useState(initialIsMember);
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  const toggle = async () => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setLoading(true);
    try {
      if (isMember) {
        const res = await fetch(`/api/v1/groups/${slug}/membership`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Failed to leave circle'));
        setIsMember(false);
      } else {
        const res = await fetch(`/api/v1/groups/${slug}/membership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Failed to join circle'));
        setIsMember(true);
      }
      router.refresh();
    } catch (err: any) {
      toast({ title: err.message || 'Something went wrong', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={toggle}
      disabled={loading}
      variant={isMember ? 'secondary' : 'primary'}
      aria-label={isMember ? 'Leave circle' : undefined}
      className={className}
    >
      {loading ? 'Saving...' : isMember ? joinedLabel : 'Join circle'}
    </Button>
  );
}
