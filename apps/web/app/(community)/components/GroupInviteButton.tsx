'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { UserPlus, X, Copy, Check } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import type { GroupInvite, InviteRole } from '@pm-operator/api';

interface GroupInviteButtonProps {
  slug: string;
}

const ROLES: { value: InviteRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
];

export function GroupInviteButton({ slug }: GroupInviteButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<InviteRole>('member');
  const [maxUses, setMaxUses] = React.useState(1);
  const [expiresAt, setExpiresAt] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [invite, setInvite] = React.useState<GroupInvite | null>(null);
  const [copied, setCopied] = React.useState(false);

  const reset = () => {
    setRole('member');
    setMaxUses(1);
    setExpiresAt('');
    setError(null);
    setInvite(null);
    setCopied(false);
    setSubmitting(false);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { groupSlug: slug, role, maxUses };
      if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
      const res = await fetch(`/api/v1/groups/${slug}/invites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message || 'Failed to create invite');
      }
      const json = (await res.json()) as { data?: GroupInvite };
      setInvite(json.data ?? null);
    } catch (err: any) {
      setError(err.message || 'Failed to create invite');
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!invite?.code) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" className="gap-1">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Invite
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-lg focus:outline-none">
          <div className="flex items-center justify-between pb-4">
            <Dialog.Title className="text-lg font-semibold">Invite to circle</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          {invite ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Share this invite code. It grants the selected role when redeemed.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
                <code className="flex-1 break-all text-sm">{invite.code}</code>
                <Button variant="ghost" size="sm" onClick={copyCode} className="gap-1">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-foreground">Role</legend>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                        role === r.value ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="invite-role"
                        value={r.value}
                        checked={role === r.value}
                        onChange={() => setRole(r.value)}
                        className="sr-only"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="invite-max-uses" className="text-sm font-medium text-foreground">
                  Max uses
                </label>
                <Input
                  id="invite-max-uses"
                  type="number"
                  min={1}
                  max={1000}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="invite-expires" className="text-sm font-medium text-foreground">
                  Expires (optional)
                </label>
                <Input
                  id="invite-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>

              {error ? <p className="text-sm text-error" role="alert">{error}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary" disabled={submitting}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create invite'}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
