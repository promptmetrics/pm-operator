'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Flag, X } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { Input } from '@pm-operator/ui/components/Input';
import type { TargetType } from '@pm-operator/api';

interface FlagDialogProps {
  targetType: TargetType;
  targetId: string;
  children?: React.ReactNode;
}

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'off_topic', label: 'Off-topic' },
  { value: 'other', label: 'Other' },
];

export function FlagDialog({ targetType, targetId, children }: FlagDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('other');
  const [detail, setDetail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  const reset = () => {
    setReason('other');
    setDetail('');
    setConfirmed(false);
    setSubmitting(false);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = reason === 'other' && detail.trim() ? detail.trim() : reason;
      const res = await fetch('/api/v1/flags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason: body }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message || 'Failed to submit flag');
      }
      setConfirmed(true);
    } catch (err: any) {
      alert(err.message || 'Failed to submit flag');
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children ? (
        <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      ) : (
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="sm" aria-label="Flag">
            <Flag className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
      )}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 shadow-lg focus:outline-none">
          <div className="flex items-center justify-between pb-4">
            <Dialog.Title className="text-lg font-semibold">Flag content</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          {confirmed ? (
            <div className="py-4 text-center">
              <p className="font-medium">Flag submitted</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Moderators will review this content. Thanks for keeping the community safe.
              </p>
              <Button className="mt-4" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-foreground">Reason</legend>
                <div className="flex flex-col gap-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        reason === r.value ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="flag-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="sr-only"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {reason === 'other' ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="flag-detail" className="text-sm font-medium text-foreground">
                    Details
                  </label>
                  <Input
                    id="flag-detail"
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="Describe the issue..."
                    required
                  />
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary" disabled={submitting}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit flag'}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
