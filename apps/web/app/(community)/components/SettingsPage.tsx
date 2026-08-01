'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Button } from '@pm-operator/ui/components/Button';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import { Input } from '@pm-operator/ui/components/Input';
import { Card } from '@pm-operator/ui/components/Card';
import { useToast } from '@pm-operator/ui/components/Toast';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import { Badge } from '@pm-operator/ui/components/Badge';
import { createAuthClient } from '@/lib/auth/client';
import type { Group, UserPreferences, UserRole } from '@pm-operator/api';

interface SettingsUser {
  id: string;
  email: string;
  username: string;
  userslug: string;
  fullName: string | null;
  pictureUrl: string | null;
  role: UserRole;
  preferences?: UserPreferences;
}

interface SettingsPageProps {
  user: SettingsUser;
  memberships: { group: Group; role: UserRole }[];
}

export function SettingsPage({ user, memberships }: SettingsPageProps) {
  const [fullName, setFullName] = React.useState(user.fullName ?? '');
  const [preferences, setPreferences] = React.useState<UserPreferences>(
    user.preferences ?? {}
  );
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [leaveSlug, setLeaveSlug] = React.useState<string | null>(null);
  const { toast } = useToast();

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName || undefined,
          preferences,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage('Saved');
    } catch (err: any) {
      setMessage(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const leaveGroup = async (slug: string) => {
    try {
      const res = await fetch(`/api/v1/groups/${slug}/membership`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to leave circle');
      window.location.reload();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to leave circle', variant: 'error' });
    }
  };

  const signOut = async () => {
    await createAuthClient().auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center gap-4">
          <Avatar
            src={user.pictureUrl ?? undefined}
            alt={user.username}
            fallback={user.fullName || user.username}
            size="lg"
          />
          <div>
            <p className="font-medium">{user.fullName || user.username}</p>
            <p className="text-sm text-[var(--pm-muted)]">@{user.userslug} · {user.email}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Profile</h2>
        <form onSubmit={saveProfile} className="flex flex-col gap-4">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium">Display name</label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Preferences</p>
            {<PreferenceRow
              label="Email notifications"
              checked={!!preferences.emailNotifications}
              onChange={(v) => setPreferences((p) => ({ ...p, emailNotifications: v }))}
            />}
            {<PreferenceRow
              label="Weekly digest"
              checked={!!preferences.weeklyDigest}
              onChange={(v) => setPreferences((p) => ({ ...p, weeklyDigest: v }))}
            />}
            {<PreferenceRow
              label="Reduced motion"
              checked={!!preferences.reducedMotion}
              onChange={(v) => setPreferences((p) => ({ ...p, reducedMotion: v }))}
            />}
            {<PreferenceRow
              label="Newsletter"
              checked={!!preferences.newsletter}
              onChange={(v) => setPreferences((p) => ({ ...p, newsletter: v }))}
            />}
          </div>

          {message ? <p className="text-sm text-[var(--pm-muted)]">{message}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</Button>
          </div>
        </form>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Your circles</h2>
        {memberships.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {memberships.map(({ group, role }) => (
              <li key={group.id} className="flex items-center justify-between rounded-lg border border-[var(--pm-line)] p-3">
                <Link href={`/g/${group.slug}`} className="flex items-center gap-2 hover:text-[var(--pm-coral-dark)]">
                  {group.color ? (
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} aria-hidden="true" />
                  ) : null}
                  <span className="font-medium">{group.name}</span>
                  <Badge variant="outline">{role}</Badge>
                </Link>
                <Button variant="secondary" size="sm" onClick={() => setLeaveSlug(group.slug)}>
                  Leave
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--pm-muted)]">You haven’t joined any circles yet.</p>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={signOut} className="gap-1">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>

      <ConfirmDialog
        destructive
        open={leaveSlug !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveSlug(null);
        }}
        title="Leave this circle?"
        confirmLabel="Leave"
        onConfirm={async () => {
          if (leaveSlug) await leaveGroup(leaveSlug);
        }}
      />
    </div>
  );
}

function PreferenceRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[var(--pm-line)]"
      />
      {label}
    </label>
  );
}
