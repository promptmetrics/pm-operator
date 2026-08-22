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
import { apiErrorMessage } from '@/lib/api/client-errors';
import { BioLengthMeter } from '@/components/BioLengthMeter';
import type { Group, UserPreferences, UserRole } from '@pm-operator/api';

interface SettingsUser {
  id: string;
  email: string;
  username: string;
  userslug: string;
  fullName: string | null;
  pictureUrl: string | null;
  role: UserRole;
  aboutMe: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  bioBonusEarned: boolean;
  preferences?: UserPreferences;
}

interface SettingsPageProps {
  user: SettingsUser;
  memberships: { group: Group; role: UserRole }[];
}

type EmailSwitchKey =
  | 'emailReplies'
  | 'emailSolutions'
  | 'emailMentions'
  | 'weeklyDigest'
  | 'emailFollows';

/**
 * The five email switches (plan D-C). `live: false` means the value is stored
 * in users.preferences but no job reads it yet — the row says so inline, so the
 * UI never implies mail goes out today.
 *
 * `defaultOn` must mirror what the backend does with a MISSING value, or the
 * toggle lies and saving the form silently changes delivery:
 *   - weeklyDigest is opt-IN — the cron filters on
 *     preferences->>'weeklyDigest' = 'true', so unset means no digest.
 *   - the transactional switches are opt-OUT — sendTransactional only
 *     suppresses on an explicit `false`, so unset means mail is sent.
 */
const EMAIL_SWITCHES: {
  key: EmailSwitchKey;
  label: string;
  description: string;
  live: boolean;
  defaultOn: boolean;
}[] = [
  {
    key: 'emailReplies',
    label: 'Replies to my posts',
    description: 'Someone comments on a post or answer of yours',
    live: false,
    defaultOn: true,
  },
  {
    key: 'emailSolutions',
    label: 'Solution accepted',
    description: 'Your answer gets accepted (+25 pts)',
    live: true,
    defaultOn: true,
  },
  {
    key: 'emailMentions',
    label: 'Mentions',
    description: 'Someone @mentions you',
    live: false,
    defaultOn: true,
  },
  {
    key: 'weeklyDigest',
    label: 'Weekly digest',
    description: 'Monday recap of your circles',
    live: true,
    defaultOn: false,
  },
  {
    key: 'emailFollows',
    label: 'New followers',
    description: 'Someone follows you',
    live: false,
    defaultOn: true,
  },
];

export function SettingsPage({ user, memberships }: SettingsPageProps) {
  const [fullName, setFullName] = React.useState(user.fullName ?? '');
  const [headline, setHeadline] = React.useState(user.headline ?? '');
  const [aboutMe, setAboutMe] = React.useState(user.aboutMe ?? '');
  const [linkedinUrl, setLinkedinUrl] = React.useState(user.linkedinUrl ?? '');
  const [githubUrl, setGithubUrl] = React.useState(user.githubUrl ?? '');
  const [bioEarned, setBioEarned] = React.useState(user.bioBonusEarned);
  const [preferences, setPreferences] = React.useState<UserPreferences>(
    user.preferences ?? {}
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [leaveSlug, setLeaveSlug] = React.useState<string | null>(null);
  const { toast } = useToast();

  const onAvatarSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await fetch('/api/v1/me/avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const errJson = (await res.json()) as { error?: { message?: string } };
        throw new Error(errJson.error?.message || 'Failed to start upload');
      }
      const { uploadUrl } = (await res.json()) as { uploadUrl: string };
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Failed to upload avatar');
      toast({ title: 'Avatar updated', variant: 'success' });
      window.location.reload();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to upload avatar', variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      // PATCH /api/v1/me merges `preferences` over the stored jsonb server-side
      // (updateUserProfile), so sending just the five switches preserves every
      // other stored key — checklistDismissed, checklistCompletedAt,
      // reducedMotion, newsletter, emailNotifications.
      const res = await fetch('/api/v1/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName || undefined,
          headline: headline || undefined,
          aboutMe,
          // The links columns only accept valid URLs; a blank field means
          // "leave unchanged", not "clear".
          linkedinUrl: linkedinUrl.trim() || undefined,
          githubUrl: githubUrl.trim() || undefined,
          preferences: Object.fromEntries(
            EMAIL_SWITCHES.map((s) => [s.key, preferences[s.key] ?? s.defaultOn])
          ),
        }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Failed to save'));
      // The award fires server-side on a ≥50-char bio; flip the badge locally
      // so the user sees it without a reload.
      if (aboutMe.trim().length >= 50) setBioEarned(true);
      setSaved(true);
    } catch (err: any) {
      const message = err.message || 'Failed to save';
      setError(message);
      toast({ title: message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const leaveGroup = async (slug: string) => {
    try {
      const res = await fetch(`/api/v1/groups/${slug}/membership`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await apiErrorMessage(res, 'Failed to leave circle'));
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
    <div className="mx-auto max-w-[560px]">
      <h1 className="mb-5 font-serif text-[26px] font-semibold text-[var(--pm-ink)]">
        Settings
      </h1>

      <form onSubmit={saveProfile}>
        {/* ---------------- 1. Profile ---------------- */}
        <Card className="mb-4 px-[22px] py-5">
          <h2 className="mb-[14px] font-serif text-base font-semibold text-[var(--pm-ink)]">
            Profile
          </h2>

          <div className="mb-4 flex items-center gap-[14px]">
            <Avatar
              src={user.pictureUrl ?? undefined}
              alt={user.username}
              fallback={user.fullName || user.username}
              size="lg"
            />
            <div className="min-w-0">
              <label className="inline-flex cursor-pointer items-center rounded-[var(--pm-radius-pill)] border border-[var(--pm-line-2)] bg-[var(--pm-paper)] px-[15px] py-2 text-[12.5px] font-semibold text-[var(--pm-ink)] transition-colors hover:border-[var(--pm-ink)] focus-within:shadow-[var(--pm-focus)]">
                {uploading ? 'Uploading…' : 'Change photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => onAvatarSelected(e.target.files?.[0])}
                  className="sr-only"
                />
              </label>
              <p className="mt-1.5 truncate text-[11.5px] text-[var(--pm-muted-soft)]">
                @{user.userslug} · JPEG, PNG or WebP
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              id="fullName"
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              description="Shown on your profile, posts and comments."
            />
            <Input
              id="headline"
              label="Role & company"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="RevOps lead, Northwind"
              description="One line under your name on your public profile."
            />
            <Input
              id="email"
              label="Email"
              value={user.email}
              readOnly
              aria-readonly="true"
              className="bg-[var(--pm-paper-2)] text-[var(--pm-muted)]"
              description="Contact an admin to change your email."
            />
          </div>
        </Card>

        {/* ---------------- 2. About me (bio bonus) ---------------- */}
        <Card className="mb-4 px-[22px] py-5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h2 className="font-serif text-base font-semibold text-[var(--pm-ink)]">About me</h2>
            {bioEarned ? (
              <span className="inline-flex items-center gap-1.5 rounded-[var(--pm-radius-pill)] bg-[var(--pm-paper-3)] px-2.5 py-1 text-xs font-bold text-[var(--pm-green)]">
                ✓ +5 pts earned
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-[var(--pm-radius-pill)] bg-[var(--pm-coral-tint)] px-2.5 py-1 text-xs font-bold text-[var(--pm-coral-dark)]">
                +5 pts on first save
              </span>
            )}
          </div>
          <p className="mb-3.5 text-[12.5px] leading-[1.6] text-[var(--pm-muted)]">
            Two to four sentences: your role, your company, and what you build or operate. It
            shows on your profile and on every post you write.
          </p>
          <textarea
            id="aboutMe"
            rows={5}
            value={aboutMe}
            onChange={(e) => setAboutMe(e.target.value)}
            placeholder="e.g. RevOps lead at Northwind, a 40-person B2B SaaS. I run HubSpot, Outreach, and a pile of MCP servers that keep our contact data honest. Mostly here for dedupe war stories."
            className="box-border w-full resize-y rounded-[var(--pm-radius-sm)] border border-[var(--pm-line-2)] bg-[var(--pm-paper)] px-3.5 py-3 text-[15px] leading-[1.6] text-[var(--pm-ink)] focus:border-[var(--pm-coral)] focus:outline-none"
          />
          <BioLengthMeter value={aboutMe} variant="settings" />
        </Card>

        {/* ---------------- 3. Links ---------------- */}
        <Card className="mb-4 px-[22px] py-5">
          <h2 className="mb-1.5 font-serif text-base font-semibold text-[var(--pm-ink)]">Links</h2>
          <p className="mb-4 text-[12.5px] leading-[1.6] text-[var(--pm-muted)]">
            Optional. They show on your profile as verified links to you, so people can place
            your name outside the community.
          </p>
          <div className="flex flex-col gap-3.5">
            <label className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-3.5">
              <span className="text-[13px] font-semibold text-[var(--pm-ink-2)]">LinkedIn</span>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/username"
                className="h-[38px] rounded-[var(--pm-radius-sm)] border border-[var(--pm-line-2)] bg-[var(--pm-paper)] px-3 font-mono text-sm text-[var(--pm-ink)] focus:border-[var(--pm-coral)] focus:outline-none"
              />
            </label>
            <label className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-3.5">
              <span className="text-[13px] font-semibold text-[var(--pm-ink-2)]">GitHub</span>
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/username"
                className="h-[38px] rounded-[var(--pm-radius-sm)] border border-[var(--pm-line-2)] bg-[var(--pm-paper)] px-3 font-mono text-sm text-[var(--pm-ink)] focus:border-[var(--pm-coral)] focus:outline-none"
              />
            </label>
          </div>
        </Card>

        {/* ------------ 4. Email notifications ------------ */}
        <Card className="mb-4 px-[22px] py-5">
          <fieldset>
            <legend className="mb-1 font-serif text-base font-semibold text-[var(--pm-ink)]">
              Email notifications
            </legend>
            <p className="mb-[14px] text-[12.5px] text-[var(--pm-muted)]">
              Delivered by email — in-app notifications are always on.
            </p>

            <div className="flex flex-col gap-3">
              {EMAIL_SWITCHES.map((s) => (
                <PreferenceToggle
                  key={s.key}
                  id={s.key}
                  label={s.label}
                  description={s.description}
                  live={s.live}
                  checked={preferences[s.key] ?? s.defaultOn}
                  onChange={(v) => setPreferences((p) => ({ ...p, [s.key]: v }))}
                />
              ))}
            </div>

            <p className="mt-[14px] border-t border-[var(--pm-line)] pt-3 text-[11.5px] leading-[1.55] text-[var(--pm-muted)]">
              The weekly digest and solution-accepted emails send today. The other three are
              saved to your account now and will start sending when those emails ship — switching
              one on won’t put mail in your inbox yet. You can change any of these at any time;
              changes take effect on the next send.
            </p>
          </fieldset>
        </Card>

        {/* ---------------- 5. My circles ---------------- */}
        <Card className="mb-4 px-[22px] py-5">
          <h2 className="mb-[14px] font-serif text-base font-semibold text-[var(--pm-ink)]">
            My circles
          </h2>
          {memberships.length > 0 ? (
            <ul className="flex flex-col gap-2.5" role="list">
              {memberships.map(({ group, role }) => (
                <li key={group.id} className="flex items-center gap-[11px]">
                  <span
                    aria-hidden="true"
                    className="h-[9px] w-[9px] shrink-0 rounded-full"
                    style={{ backgroundColor: group.color ?? 'var(--pm-line-2)' }}
                  />
                  <Link
                    href={`/g/${group.slug}`}
                    className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral-dark)]"
                  >
                    {group.name}
                  </Link>
                  <Badge variant="outline">{role}</Badge>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-[var(--pm-radius-pill)]"
                    aria-label={`Leave ${group.name}`}
                    onClick={() => setLeaveSlug(group.slug)}
                  >
                    Leave
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="text-[13.5px] text-[var(--pm-muted)]">
                You haven’t joined any circles yet.
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                <Link href="/feed">Browse circles</Link>
              </Button>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={signOut} className="gap-1.5">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
          <div className="flex items-center gap-3">
            <Link
              href={`/u/${user.userslug}`}
              className="text-sm font-semibold text-[var(--pm-ink-2)] hover:text-[var(--pm-coral-dark)]"
            >
              View public profile →
            </Link>
            {saved ? (
              <span role="status" className="text-[12.5px] font-medium text-[var(--pm-green)]">
                Saved ✓
              </span>
            ) : null}
            {error ? (
              <span role="alert" className="text-[12.5px] text-[var(--pm-danger)]">
                {error}
              </span>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        destructive
        open={leaveSlug !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveSlug(null);
        }}
        title="Leave this circle?"
        description="You’ll stop seeing its posts in your feed. You can rejoin later if it’s public."
        confirmLabel="Leave"
        onConfirm={async () => {
          if (leaveSlug) await leaveGroup(leaveSlug);
        }}
      />
    </div>
  );
}

function PreferenceToggle({
  id,
  label,
  description,
  checked,
  live,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  live: boolean;
  onChange: (checked: boolean) => void;
}) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-[14px] rounded-[var(--pm-radius-sm)] text-left focus:outline-none focus-visible:shadow-[var(--pm-focus)]"
    >
      <span className="min-w-0">
        {/* The badge sits OUTSIDE the labelled span so the switch's accessible
            name stays exactly the preference label. */}
        <span className="flex items-center gap-2">
          <span id={labelId} className="text-[13.5px] font-medium text-[var(--pm-ink)]">
            {label}
          </span>
          {!live ? (
            <Badge
              variant="outline"
              className="px-1.5 py-0 text-[10px] font-medium text-[var(--pm-muted)]"
            >
              not sending yet
            </Badge>
          ) : null}
        </span>
        <span id={descriptionId} className="mt-px block text-[12px] text-[var(--pm-muted)]">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[var(--pm-teal)]' : 'bg-[var(--pm-line-2)]'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow)] transition-[left] ${
            checked ? 'left-[18px]' : 'left-[2px]'
          }`}
        />
      </span>
    </button>
  );
}
