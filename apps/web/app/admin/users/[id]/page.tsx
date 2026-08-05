'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@pm-operator/ui/components/Card';
import { Button } from '@pm-operator/ui/components/Button';
import { useToast } from '@pm-operator/ui/components/Toast';
import { Shield, Mail, AlertTriangle, Ban, Trash2 } from 'lucide-react';

const ROLES = ['member', 'moderator', 'admin'] as const;

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/users/${id}`);
      if (!res.ok) throw new Error('Failed to load user');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (newRole: string) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      toast({ title: 'Role updated', variant: 'success' });
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to update role', variant: 'error' });
    }
  };

  const deleteUser = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete user');
      toast({ title: 'User deleted (GDPR anonymized)', variant: 'success' });
      router.push('/admin/users');
    } catch (err: any) {
      toast({ title: err.message || 'Failed to delete user', variant: 'error' });
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl"><p className="text-[var(--pm-muted)]">Loading user...</p></div>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-[var(--pm-danger)]">{error}</p>
        <Button onClick={load} className="mt-4">Retry</Button>
      </div>
    );
  }

  if (!data) return null;

  const { user, activity, badges, memberships, moderationHistory } = data;

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'activity', label: 'Activity' },
    { key: 'badges', label: `Badges (${badges?.length || 0})` },
    { key: 'memberships', label: `Memberships (${memberships?.length || 0})` },
    { key: 'moderation', label: `Moderation (${moderationHistory?.length || 0})` },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/users" className="text-sm text-[var(--pm-coral)] hover:underline">
          &larr; Users
        </Link>
        <h1 className="text-2xl font-semibold">{user.fullName || user.username}</h1>
        <span className="rounded-full bg-[var(--pm-muted)]/20 px-2 py-0.5 text-xs text-[var(--pm-muted)]">
          @{user.userslug}
        </span>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 border-b border-[var(--pm-line)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm ${
              activeTab === tab.key
                ? 'border-b-2 border-[var(--pm-coral)] font-medium text-[var(--pm-coral)]'
                : 'text-[var(--pm-muted)] hover:text-[var(--pm-ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <h2 className="mb-4 text-lg font-medium">User info</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Username</p>
                <p className="font-medium">{user.username}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Role</p>
                <select
                  value={user.role}
                  onChange={(e) => changeRole(e.target.value)}
                  className="mt-1 h-10 rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Reputation</p>
                <p className="font-medium">{user.reputationScore}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Streak days</p>
                <p className="font-medium">{user.streakDays}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Joined</p>
                <p className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--pm-muted)]">Last active</p>
                <p className="font-medium">
                  {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : 'Never'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm text-[var(--pm-muted)]">Bio</p>
                <p className="font-medium">{user.aboutMe || 'No bio'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-lg font-medium">Actions</h2>
            <div className="flex flex-col gap-3">
              <Link href={`/u/${user.userslug}`}>
                <Button variant="secondary" className="w-full">
                  <Shield className="mr-2 h-4 w-4" />
                  View profile
                </Button>
              </Link>
              <a href={`mailto:${user.email}`}>
                <Button variant="secondary" className="w-full">
                  <Mail className="mr-2 h-4 w-4" />
                  Send email
                </Button>
              </a>
              <Button variant="secondary" className="w-full">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Warn user
              </Button>
              <Button variant="secondary" className="w-full">
                <Ban className="mr-2 h-4 w-4" />
                Ban user
              </Button>
              {!showDeleteConfirm ? (
                <Button variant="danger" className="w-full" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete account (GDPR)
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-[var(--pm-danger)]">
                    This will anonymize all user data. Are you sure?
                  </p>
                  <Button variant="danger" onClick={deleteUser} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Confirm delete'}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <div className="flex flex-col gap-3">
          {!activity || activity.length === 0 ? (
            <p className="text-[var(--pm-muted)]">No recent activity.</p>
          ) : (
            activity.map((item: any, i: number) => (
              <Card key={`${item.type}-${item.id}-${i}`} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {item.type === 'post' ? (
                        <Link href={`/g/${item.groupId}/${item.slug}`} className="hover:text-[var(--pm-coral)]">
                          {item.title}
                        </Link>
                      ) : (
                        <span>{item.content}</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--pm-muted)]">
                      {item.type} · {new Date(item.createdAt).toLocaleDateString()}
                      {item.status ? ` · ${item.status}` : ''}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Badges tab */}
      {activeTab === 'badges' && (
        <div className="flex flex-col gap-3">
          {!badges || badges.length === 0 ? (
            <p className="text-[var(--pm-muted)]">No badges earned.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b: any) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center gap-3">
                    {b.iconUrl ? (
                      <img src={b.iconUrl} alt="" className="h-8 w-8 rounded" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--pm-coral)]/10 text-sm">
                        {b.name[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-[var(--pm-muted)]">
                        {new Date(b.awardedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Memberships tab */}
      {activeTab === 'memberships' && (
        <div className="flex flex-col gap-3">
          {!memberships || memberships.length === 0 ? (
            <p className="text-[var(--pm-muted)]">No circle memberships.</p>
          ) : (
            memberships.map((m: any) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {m.groupColor ? (
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: m.groupColor }} />
                    ) : null}
                    <div>
                      <Link href={`/admin/groups/${m.groupId}`} className="text-sm font-medium hover:text-[var(--pm-coral)]">
                        {m.groupName}
                      </Link>
                      <p className="text-xs text-[var(--pm-muted)]">
                        {m.role} · joined {new Date(m.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Moderation tab */}
      {activeTab === 'moderation' && (
        <div className="flex flex-col gap-3">
          {!moderationHistory || moderationHistory.length === 0 ? (
            <p className="text-[var(--pm-muted)]">No moderation history.</p>
          ) : (
            moderationHistory.map((f: any) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{f.reason || 'No reason'}</p>
                    <p className="text-xs text-[var(--pm-muted)]">
                      Status: {f.status} · {f.autoFlagged ? 'Auto-flagged' : 'Reported'} · {new Date(f.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
