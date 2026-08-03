'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';
import { apiErrorMessage } from '@/lib/api/client-errors';

interface InviteOnlyPreviewProps {
  slug: string;
  name: string;
  color: string | null;
  description: string | null;
  memberCount: number;
}

// T8.9 (spec §5.5/522): the gated preview logged-in non-members see for an
// invite-only circle — lock, short description, and an "Enter invite code"
// field. Submitting hits the join endpoint with the code; on success the page
// refreshes into the full member view. Metadata only is passed in from the
// server, so this component never touches posts or the member list.
export function InviteOnlyPreview({ slug, name, color, description, memberCount }: InviteOnlyPreviewProps) {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  const joinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/groups/${slug}/membership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code.trim() }),
      });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, 'Invalid invite code'));
      }
      toast({ title: `You joined ${name}`, variant: 'success' });
      router.refresh();
    } catch (err: any) {
      toast({ title: err.message || 'Invalid invite code', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-[var(--pm-line)] bg-[var(--pm-paper-2)] p-8 shadow-[var(--pm-shadow)]">
        <div className="mb-5 flex items-center gap-4">
          <span
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-xl font-serif text-[22px] font-semibold text-[var(--pm-on-ink)]"
            style={{ backgroundColor: color ?? 'var(--pm-coral)' }}
            aria-hidden="true"
          >
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-serif text-2xl font-semibold text-[var(--pm-ink)]">{name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pm-line)] bg-[var(--pm-paper)] px-2 py-0.5 text-xs capitalize text-[var(--pm-muted)]">
                <Lock className="h-3 w-3" aria-hidden="true" />
                invite only
              </span>
            </div>
            <p className="text-sm text-[var(--pm-muted)]">{memberCount.toLocaleString()} members</p>
          </div>
        </div>

        {description ? (
          <p className="mb-6 text-sm text-[var(--pm-ink-2)]">{description}</p>
        ) : null}

        <div className="rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-5">
          <p className="mb-3 text-sm font-semibold text-[var(--pm-ink)]">Membership required</p>
          <p className="mb-4 text-sm text-[var(--pm-muted)]">
            This circle is invite-only. Enter an invite code to join, or request one from a member.
          </p>
          <form onSubmit={joinWithCode} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Invite code"
              autoComplete="off"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !code.trim()}>
              {loading ? 'Joining…' : 'Join with code'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}