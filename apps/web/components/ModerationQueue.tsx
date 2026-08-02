'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@pm-operator/ui/components/Card';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';
import type { FlagQueueItem, FlagStatus } from '@pm-operator/api';

export function ModerationQueue() {
  const [flags, setFlags] = React.useState<FlagQueueItem[]>([]);
  const [status, setStatus] = React.useState<FlagStatus>('open');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const [deleteFlagId, setDeleteFlagId] = React.useState<string | null>(null);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/moderation/queue?status=${status}`);
      if (!res.ok) throw new Error('Failed to load queue');
      const json = (await res.json()) as { data?: { flags: FlagQueueItem[] } };
      setFlags(json.data?.flags ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const resolve = async (id: string, resolution: 'resolved' | 'dismissed') => {
    try {
      const res = await fetch(`/api/v1/flags/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: resolution, resolutionNote: note }),
      });
      if (!res.ok) throw new Error('Failed to resolve flag');
      setNote('');
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to resolve flag', variant: 'error' });
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/flags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete flag');
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to delete flag', variant: 'error' });
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Moderation queue</h1>
        <div className="flex gap-2">
          {(['open', 'resolved', 'dismissed'] as FlagStatus[]).map((s) => (
            <Button
              key={s}
              variant={status === s ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setStatus(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {error ? <p className="mb-4 text-[var(--pm-danger)]">{error}</p> : null}

      <div className="mb-4">
        <Input
          label="Resolution note (applied to next action)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for resolution"
        />
      </div>

      <div className="flex flex-col gap-4">
        {loading && flags.length === 0 ? (
          <p className="text-[var(--pm-muted)]">Loading...</p>
        ) : flags.length === 0 ? (
          <p className="text-[var(--pm-muted)]">No {status} flags.</p>
        ) : (
          flags.map((flag) => (
            <Card key={flag.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {flag.target.type === 'message' ? (
                    'Direct message'
                  ) : (
                    <>
                      {flag.target.type === 'post' ? 'Post' : 'Comment'} in{' '}
                      <Link
                        href={`/g/${flag.target.group?.slug}`}
                        className="text-[var(--pm-coral)] hover:underline"
                      >
                        {flag.target.group?.name}
                      </Link>
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-[var(--pm-muted)]">
                  Reason: {flag.reason || 'No reason'} ·{' '}
                  {flag.autoFlagged ? 'Auto-flagged' : 'User report'} · by{' '}
                  <Link href={`/u/${flag.target.author.userslug}`} className="hover:text-[var(--pm-ink)]">
                    {flag.target.author.username}
                  </Link>
                </p>
                {flag.target.title ? <p className="font-medium">{flag.target.title}</p> : null}
                {flag.target.content ? (
                  flag.target.type === 'message' ? (
                    // Message flag content is contentPlain (plain text), not
                    // HTML — render it as text so a DM body is never parsed as
                    // markup.
                    <p className="whitespace-pre-wrap break-words rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-sm">
                      {flag.target.content}
                    </p>
                  ) : (
                    <div
                      className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-3 text-sm"
                      dangerouslySetInnerHTML={{ __html: flag.target.content }}
                    />
                  )
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={
                      flag.target.type === 'message'
                        ? `/messages/${flag.target.conversationId ?? ''}`
                        : `/p/${flag.target.id}`
                    }
                  >
                    <Button variant="secondary" size="sm">View</Button>
                  </Link>
                  {flag.status === 'open' ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => resolve(flag.id, 'dismissed')}>
                        Dismiss
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => resolve(flag.id, 'resolved')}>
                        Hide content
                      </Button>
                    </>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => setDeleteFlagId(flag.id)}>
                    Delete flag
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <ConfirmDialog
        destructive
        open={deleteFlagId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteFlagId(null);
        }}
        title="Delete this flag permanently?"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteFlagId) await remove(deleteFlagId);
        }}
      />
    </div>
  );
}
