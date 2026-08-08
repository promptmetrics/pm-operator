'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@pm-operator/ui/components/Card';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import { Input } from '@pm-operator/ui/components/Input';
import { Select } from '@pm-operator/ui/components/Select';
import { useToast } from '@pm-operator/ui/components/Toast';
import { FlagCard, type FlagCardFlag } from '@/components/admin/FlagCard';
import { ModerationActions } from '@/components/admin/ModerationActions';
import type { FlagQueueItem, FlagStatus } from '@pm-operator/api';
import { Filter, CheckCheck, X } from 'lucide-react';

export function ModerationQueue() {
  const [flags, setFlags] = React.useState<FlagQueueItem[]>([]);
  const [status, setStatus] = React.useState<FlagStatus>('open');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const [deleteFlagId, setDeleteFlagId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [filters, setFilters] = React.useState({
    targetType: '',
    reason: '',
    autoFlagged: '',
  });
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status });
      if (filters.targetType) params.set('targetType', filters.targetType);
      if (filters.reason) params.set('reason', filters.reason);
      if (filters.autoFlagged) params.set('autoFlagged', filters.autoFlagged);

      const res = await fetch(`/api/v1/moderation/queue?${params}`);
      if (!res.ok) throw new Error('Failed to load queue');
      const json = (await res.json()) as { data?: { flags: FlagQueueItem[] } };
      setFlags(json.data?.flags ?? []);
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [status, filters]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === flags.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(flags.map((f) => f.id)));
    }
  };

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

  const batchResolve = async (resolution: 'resolved' | 'dismissed') => {
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/v1/flags/${id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: resolution, resolutionNote: note }),
          })
        )
      );
      toast({
        title: `Batch ${resolution} completed for ${selected.size} items`,
        variant: 'success',
      });
      setNote('');
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Batch action failed', variant: 'error' });
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

  const handleWarn = async (flag: FlagQueueItem) => {
    toast({ title: `Warning sent to ${flag.target.author.username}`, variant: 'success' });
  };

  const handleBan = async (flag: FlagQueueItem) => {
    toast({ title: `User ${flag.target.author.username} banned`, variant: 'success' });
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

      {/* Filter bar */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[140px]">
              <Select
                label="Target type"
                value={filters.targetType}
                onChange={(e) => setFilters((f) => ({ ...f, targetType: e.target.value }))}
              >
                <option value="">All types</option>
                <option value="post">Posts</option>
                <option value="comment">Comments</option>
                <option value="message">Messages</option>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Select
                label="Flag source"
                value={filters.autoFlagged}
                onChange={(e) => setFilters((f) => ({ ...f, autoFlagged: e.target.value }))}
              >
                <option value="">All sources</option>
                <option value="true">Auto-flagged</option>
                <option value="false">User reported</option>
              </Select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <Input
                label="Search reason"
                value={filters.reason}
                onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Filter by reason..."
              />
            </div>
            <Button variant="secondary" size="sm" onClick={load}>
              <Filter className="mr-1 h-4 w-4" />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="mb-4 text-[var(--pm-danger)]">{error}</p> : null}

      <div className="mb-4">
        <Input
          label="Resolution note (applied to next action)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for resolution"
        />
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && status === 'open' && (
        <Card className="mb-4 border-amber-500/30">
          <CardContent className="flex items-center gap-3 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button variant="secondary" size="sm" onClick={() => batchResolve('resolved')}>
              <CheckCheck className="mr-1 h-4 w-4" />
              Batch hide
            </Button>
            <Button variant="ghost" size="sm" onClick={() => batchResolve('dismissed')}>
              <X className="mr-1 h-4 w-4" />
              Batch dismiss
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {loading && flags.length === 0 ? (
          <p className="text-[var(--pm-muted)]">Loading...</p>
        ) : flags.length === 0 ? (
          <p className="text-[var(--pm-muted)]">No {status} flags.</p>
        ) : (
          <>
            {/* Select all checkbox */}
            <label className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
              <input
                type="checkbox"
                checked={selected.size === flags.length && flags.length > 0}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-[var(--pm-line)]"
              />
              Select all
            </label>

            {flags.map((flag) => (
              <div key={flag.id} className="space-y-2">
                <FlagCard
                  flag={flag as unknown as FlagCardFlag}
                  selected={selected.has(flag.id)}
                  onSelectChange={() => toggleSelect(flag.id)}
                />
                {flag.status === 'open' ? (
                  <div className="flex justify-end">
                    <ModerationActions
                      onView={() => {
                        if (flag.target.type === 'message') {
                          window.open(
                            `/messages/${(flag.target as any).conversationId ?? ''}`,
                            '_blank'
                          );
                        } else if (
                          flag.target.group?.slug &&
                          (flag.target as any).postSlug
                        ) {
                          const anchor =
                            flag.target.type === 'comment'
                              ? `#comment-${flag.target.id}`
                              : '';
                          window.open(
                            `/g/${flag.target.group.slug}/${(flag.target as any).postSlug}${anchor}`,
                            '_blank'
                          );
                        }
                      }}
                      onDismiss={() => resolve(flag.id, 'dismissed')}
                      onHide={() => resolve(flag.id, 'resolved')}
                      onWarn={() => handleWarn(flag)}
                      onBan={() => handleBan(flag)}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </>
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
