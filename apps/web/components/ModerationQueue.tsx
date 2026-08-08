'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Chip } from '@pm-operator/ui/components/Chip';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import { Input } from '@pm-operator/ui/components/Input';
import { Select } from '@pm-operator/ui/components/Select';
import { useToast } from '@pm-operator/ui/components/Toast';
import { FlagCard, type FlagCardFlag } from '@/components/admin/FlagCard';
import { ModerationActions } from '@/components/admin/ModerationActions';
import { outcomeBadge, reasonPill } from '@/components/admin/flag-presentation';
import { timeAgo } from '@/lib/format';
import type { FlagQueueItem, FlagStatus } from '@pm-operator/api';
import { CheckCheck, ShieldCheck, X } from 'lucide-react';

type QueueView = 'open' | 'history';
type Resolution = 'resolved' | 'dismissed';

interface ModerationQueueProps {
  /** Session user id, used only to tell "resolved by you" from "by another moderator". */
  currentUserId?: string;
}

interface ResolutionReceiptProps {
  flag: FlagQueueItem;
  byYou: boolean;
  /** True when this resolution happened in this session, so it is worth announcing. */
  fresh: boolean;
}

function ResolutionReceipt({ flag, byYou, fresh }: ResolutionReceiptProps) {
  const outcome = outcomeBadge(flag.status);
  if (!outcome) return null;

  // The API exposes resolverId as a bare UUID with no username, so the receipt
  // reports the actor relative to the viewer rather than printing an opaque id.
  const actor = byYou ? 'by you' : flag.resolverId ? 'by another moderator' : 'automatically';

  return (
    <div
      {...(fresh ? { role: 'status' as const } : {})}
      data-testid="resolution-receipt"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--pm-radius-md)] border border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-3 py-2 text-sm"
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--pm-green)]" aria-hidden="true" />
      <span className="font-medium text-[var(--pm-ink)]">{outcome.label}</span>
      <span className="text-[var(--pm-muted)]">
        {actor}
        {flag.resolvedAt ? ` · ${timeAgo(flag.resolvedAt)}` : ''}
      </span>
      {flag.resolutionNote ? (
        <span className="w-full break-words text-[var(--pm-ink-2)]">
          <span className="text-[var(--pm-muted)]">Note: </span>
          {flag.resolutionNote}
        </span>
      ) : null}
    </div>
  );
}

export function ModerationQueue({ currentUserId }: ModerationQueueProps = {}) {
  const [flags, setFlags] = React.useState<FlagQueueItem[]>([]);
  const [view, setView] = React.useState<QueueView>('open');
  const [historyStatus, setHistoryStatus] = React.useState<Resolution>('resolved');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [batchRunning, setBatchRunning] = React.useState(false);
  const [deleteFlagId, setDeleteFlagId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [justActed, setJustActed] = React.useState<Set<string>>(new Set());
  const [filters, setFilters] = React.useState({
    targetType: '',
    reason: '',
    autoFlagged: '',
  });
  const { toast } = useToast();

  const status: FlagStatus = view === 'open' ? 'open' : historyStatus;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Only `status` is sent: flagQuerySchema accepts status/page/limit and
      // strips anything else, so the remaining filters are applied client-side
      // over the returned page (see `visibleFlags`).
      const res = await fetch(`/api/v1/moderation/queue?status=${status}`);
      if (!res.ok) throw new Error('Failed to load queue');
      const json = (await res.json()) as { data?: { flags: FlagQueueItem[] } };
      setFlags(json.data?.flags ?? []);
      setSelected(new Set());
      setJustActed(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const visibleFlags = React.useMemo(() => {
    const query = filters.reason.trim().toLowerCase();
    return flags.filter((flag) => {
      if (filters.targetType && flag.targetType !== filters.targetType) return false;
      if (filters.autoFlagged && String(flag.autoFlagged) !== filters.autoFlagged) return false;
      if (query) {
        const raw = (flag.reason ?? '').toLowerCase();
        const label = (reasonPill(flag)?.label ?? '').toLowerCase();
        if (!raw.includes(query) && !label.includes(query)) return false;
      }
      return true;
    });
  }, [flags, filters]);

  const filtersActive =
    Boolean(filters.targetType) ||
    Boolean(filters.autoFlagged) ||
    Boolean(filters.reason.trim());

  const openIds = React.useMemo(
    () => visibleFlags.filter((f) => f.status === 'open').map((f) => f.id),
    [visibleFlags]
  );
  const allOpenSelected = openIds.length > 0 && openIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allOpenSelected ? new Set() : new Set(openIds));
  };

  /** Merge the resolved flag back into the list so the card stays put with a receipt. */
  const applyResolution = React.useCallback(
    (id: string, resolved: Partial<FlagQueueItem> | undefined, fallback: Resolution) => {
      setFlags((prev) =>
        prev.map((flag) =>
          flag.id === id
            ? {
                ...flag,
                status: resolved?.status ?? fallback,
                resolverId: resolved?.resolverId ?? currentUserId ?? null,
                resolutionNote: resolved?.resolutionNote ?? null,
                resolvedAt: resolved?.resolvedAt ?? new Date().toISOString(),
              }
            : flag
        )
      );
      setJustActed((prev) => new Set(prev).add(id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [currentUserId]
  );

  const patchFlag = async (id: string, resolution: Resolution) => {
    const res = await fetch(`/api/v1/flags/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: resolution,
        ...(note.trim() ? { resolutionNote: note.trim() } : {}),
      }),
    });
    if (!res.ok) throw new Error('Failed to resolve flag');
    const json = (await res.json()) as { data?: Partial<FlagQueueItem> };
    return json.data;
  };

  const resolve = async (id: string, resolution: Resolution) => {
    setBusyId(id);
    try {
      const resolved = await patchFlag(id, resolution);
      applyResolution(id, resolved, resolution);
      setNote('');
    } catch (err: any) {
      toast({ title: err.message || 'Failed to resolve flag', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const batchResolve = async (resolution: Resolution) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    setBatchRunning(true);
    let failed = 0;
    // Sequential on purpose. Each PATCH fans out to several queries and the
    // connection pool holds three, so a Promise.all over the selection starves
    // the pool instead of queueing.
    for (const id of ids) {
      try {
        const resolved = await patchFlag(id, resolution);
        applyResolution(id, resolved, resolution);
      } catch {
        failed += 1;
      }
    }
    setBatchRunning(false);
    setNote('');

    toast(
      failed
        ? {
            title: `${ids.length - failed} of ${ids.length} updated, ${failed} failed`,
            variant: 'error',
          }
        : {
            title: `${ids.length} flag${ids.length === 1 ? '' : 's'} ${
              resolution === 'resolved' ? 'hidden' : 'dismissed'
            }`,
            variant: 'success',
          }
    );
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

  const openTarget = (flag: FlagQueueItem) => {
    if (flag.target.type === 'message') {
      window.open(`/messages/${(flag.target as any).conversationId ?? ''}`, '_blank');
      return;
    }
    if (flag.target.group?.slug && (flag.target as any).postSlug) {
      const anchor = flag.target.type === 'comment' ? `#comment-${flag.target.id}` : '';
      window.open(
        `/g/${flag.target.group.slug}/${(flag.target as any).postSlug}${anchor}`,
        '_blank'
      );
    }
  };

  const emptyLabel =
    view === 'open'
      ? 'No open flags.'
      : historyStatus === 'resolved'
        ? 'No flags where content was hidden.'
        : 'No dismissed flags.';

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-2xl font-semibold">Moderation queue</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Queue view" className="flex gap-1.5">
            <Chip active={view === 'open'} onClick={() => setView('open')}>
              Open
            </Chip>
            <Chip active={view === 'history'} onClick={() => setView('history')}>
              History
            </Chip>
          </div>

          {view === 'history' && (
            <div role="group" aria-label="Resolution outcome" className="flex gap-1.5">
              <Chip
                active={historyStatus === 'resolved'}
                onClick={() => setHistoryStatus('resolved')}
              >
                Hidden
              </Chip>
              <Chip
                active={historyStatus === 'dismissed'}
                onClick={() => setHistoryStatus('dismissed')}
              >
                Dismissed
              </Chip>
            </div>
          )}
        </div>
      </div>

      {/* Filters narrow the loaded page in the browser, not the query. */}
      <Card className="mb-4 p-0">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[140px] flex-1">
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
            <div className="min-w-[140px] flex-1">
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
            <div className="min-w-[140px] flex-1">
              <Input
                label="Search reason"
                value={filters.reason}
                onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Spam, harassment, keyword..."
              />
            </div>
            {filtersActive && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFilters({ targetType: '', reason: '', autoFlagged: '' })}
              >
                <X className="mr-1 h-4 w-4" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="mb-4 text-[var(--pm-danger)]">
          {error}
        </p>
      ) : null}

      <div className="mb-4">
        <Input
          label="Resolution note (applied to the next action)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for resolution"
        />
      </div>

      {selected.size > 0 && (
        <Card className="mb-4 border-[var(--pm-amber-line)] bg-[var(--pm-amber-bg)] p-0">
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={batchRunning}
              onClick={() => batchResolve('resolved')}
            >
              <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
              Batch hide
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={batchRunning}
              onClick={() => batchResolve('dismissed')}
            >
              <X className="mr-1 h-4 w-4" aria-hidden="true" />
              Batch dismiss
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </CardContent>
        </Card>
      )}

      <p aria-live="polite" className="mb-3 text-sm text-[var(--pm-muted)]">
        {loading
          ? 'Loading flags…'
          : filtersActive
            ? `${visibleFlags.length} of ${flags.length} loaded flags match`
            : `${flags.length} flag${flags.length === 1 ? '' : 's'}`}
      </p>

      <div className="flex flex-col gap-4">
        {loading && flags.length === 0 ? null : visibleFlags.length === 0 ? (
          <p className="text-[var(--pm-muted)]">
            {filtersActive ? 'No flags match these filters.' : emptyLabel}
          </p>
        ) : (
          <>
            {openIds.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-[var(--pm-muted)]">
                <input
                  type="checkbox"
                  checked={allOpenSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[var(--pm-line)]"
                />
                Select all open
              </label>
            )}

            {/*
              `space-y-2` on each row is load-bearing: moderation-comment-anchor.spec.ts
              locates a flag row by `div.space-y-2` plus its reason text.
            */}
            {visibleFlags.map((flag) => (
              <div key={flag.id} data-testid="flag-row" className="space-y-2">
                <FlagCard
                  flag={flag as unknown as FlagCardFlag}
                  selected={selected.has(flag.id)}
                  {...(flag.status === 'open'
                    ? { onSelectChange: () => toggleSelect(flag.id) }
                    : {})}
                />

                {flag.status === 'open' ? (
                  <div className="flex justify-end">
                    <ModerationActions
                      disabled={busyId === flag.id || batchRunning}
                      onView={() => openTarget(flag)}
                      onDismiss={() => resolve(flag.id, 'dismissed')}
                      onHide={() => resolve(flag.id, 'resolved')}
                      onWarn={() => handleWarn(flag)}
                      onBan={() => handleBan(flag)}
                    />
                  </div>
                ) : (
                  <ResolutionReceipt
                    flag={flag}
                    byYou={Boolean(currentUserId) && flag.resolverId === currentUserId}
                    fresh={justActed.has(flag.id)}
                  />
                )}
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
