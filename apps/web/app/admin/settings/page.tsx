'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@pm-operator/ui/components/Button';
import { Card } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import {
  Palette,
  Shield,
  UserPlus,
  Bell,
  SlidersHorizontal,
  BarChart3,
  Puzzle,
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

interface SettingsData {
  branding: { name: string; logoUrl: string | null; coverUrl: string | null; faviconUrl: string | null };
  privacy: { defaultVisibility: string; publicRegistration: boolean; emailConfirmation: boolean };
  onboarding: { welcomeMessage: string; defaultCircles: string[] };
  notifications: { defaultPreferences: Record<string, boolean> };
  moderation: { autoModEnabled: boolean; minAccountAgeDays: number; minReputation: number; defaultFlagAction: string };
  analytics: { posthogKey: string | null; dataRetentionDays: number; widgetToggles: Record<string, boolean> };
}

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon: Icon, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Card className="mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-[var(--pm-paper-2)]"
      >
        <Icon className="h-5 w-5 text-[var(--pm-coral)]" aria-hidden="true" />
        <span className="flex-1 text-lg font-medium">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[var(--pm-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--pm-muted)]" />
        )}
      </button>
      {open && <div className="border-t border-[var(--pm-line)] px-6 py-4">{children}</div>}
    </Card>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = React.useState<SettingsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState('');
  const [deleteConfirm, setDeleteConfirm] = React.useState('');
  const [deleteStep, setDeleteStep] = React.useState<'initial' | 'confirm' | 'typing'>('initial');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const json = (await res.json()) as { data?: { settings: SettingsData } };
      setSettings(json.data?.settings ?? null);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const saveSection = async (section: string, values: Record<string, unknown>) => {
    setSaving(section);
    setMessage('');
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section, values }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to save settings');
    } finally {
      setSaving(null);
    }
  };

  if (loading && !settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
        <p className="text-[var(--pm-muted)]">Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
        <p className="text-[var(--pm-danger)]">{message || 'Failed to load settings'}</p>
        <Button variant="secondary" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <p className="mb-6 text-sm text-[var(--pm-muted)]">
        Manage community-wide settings. Changes take effect immediately.
      </p>

      {message ? (
        <p className="mb-4 rounded-lg border border-[var(--pm-danger)] bg-[var(--pm-danger-bg)] p-3 text-sm text-[var(--pm-danger)]">
          {message}
        </p>
      ) : null}

      {/* Branding */}
      <CollapsibleSection title="Branding" icon={Palette}>
        <div className="space-y-4">
          <Input
            label="Community name"
            value={settings.branding.name}
            onChange={(e) =>
              setSettings((s) => s ? { ...s, branding: { ...s.branding, name: e.target.value } } : s)
            }
          />
          <div className="flex items-center gap-3">
            {settings.branding.logoUrl ? (
              <img src={settings.branding.logoUrl} alt="Logo" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : null}
            <Input
              label="Logo URL"
              value={settings.branding.logoUrl ?? ''}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, branding: { ...s.branding, logoUrl: e.target.value || null } } : s)
              }
            />
          </div>
          <div className="flex items-center gap-3">
            {settings.branding.coverUrl ? (
              <img src={settings.branding.coverUrl} alt="Cover" className="h-16 w-32 shrink-0 rounded-lg object-cover" />
            ) : null}
            <Input
              label="Cover image URL"
              value={settings.branding.coverUrl ?? ''}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, branding: { ...s.branding, coverUrl: e.target.value || null } } : s)
              }
            />
          </div>
          <div className="flex items-center gap-3">
            {settings.branding.faviconUrl ? (
              <img src={settings.branding.faviconUrl} alt="Favicon" className="h-8 w-8 shrink-0 rounded" />
            ) : null}
            <Input
              label="Favicon URL"
              value={settings.branding.faviconUrl ?? ''}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, branding: { ...s.branding, faviconUrl: e.target.value || null } } : s)
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection('branding', {
                  name: settings.branding.name,
                  logoUrl: settings.branding.logoUrl,
                  coverUrl: settings.branding.coverUrl,
                  faviconUrl: settings.branding.faviconUrl,
                })
              }
              disabled={saving === 'branding'}
            >
              {saving === 'branding' ? 'Saving...' : 'Save branding'}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Privacy */}
      <CollapsibleSection title="Privacy" icon={Shield}>
        <div className="space-y-4">
          <div>
            <label htmlFor="defaultVisibility" className="mb-1 block text-sm font-medium">Default visibility</label>
            <select
              id="defaultVisibility"
              value={settings.privacy.defaultVisibility}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, privacy: { ...s.privacy, defaultVisibility: e.target.value } } : s)
              }
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              <option value="public">Public</option>
              <option value="invite_only">Invite only</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.privacy.publicRegistration}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, privacy: { ...s.privacy, publicRegistration: e.target.checked } } : s)
              }
              className="h-4 w-4 rounded border-[var(--pm-line)]"
            />
            <span className="text-sm">Allow public registration</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.privacy.emailConfirmation}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, privacy: { ...s.privacy, emailConfirmation: e.target.checked } } : s)
              }
              className="h-4 w-4 rounded border-[var(--pm-line)]"
            />
            <span className="text-sm">Require email confirmation</span>
          </label>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection('privacy', {
                  defaultVisibility: settings.privacy.defaultVisibility,
                  publicRegistration: settings.privacy.publicRegistration,
                  emailConfirmation: settings.privacy.emailConfirmation,
                })
              }
              disabled={saving === 'privacy'}
            >
              {saving === 'privacy' ? 'Saving...' : 'Save privacy'}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Onboarding */}
      <CollapsibleSection title="Onboarding" icon={UserPlus}>
        <div className="space-y-4">
          <div>
            <label htmlFor="welcomeMessage" className="mb-1 block text-sm font-medium">Welcome message</label>
            <textarea
              id="welcomeMessage"
              value={settings.onboarding.welcomeMessage}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, onboarding: { ...s.onboarding, welcomeMessage: e.target.value } } : s)
              }
              rows={3}
              className="w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 py-2 text-sm"
            />
          </div>
          <Input
            label="Default circles (comma-separated slugs)"
            value={settings.onboarding.defaultCircles.join(', ')}
            onChange={(e) =>
              setSettings((s) =>
                s
                  ? {
                      ...s,
                      onboarding: {
                        ...s.onboarding,
                        defaultCircles: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                      },
                    }
                  : s
              )
            }
          />
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection('onboarding', {
                  welcomeMessage: settings.onboarding.welcomeMessage,
                  defaultCircles: settings.onboarding.defaultCircles,
                })
              }
              disabled={saving === 'onboarding'}
            >
              {saving === 'onboarding' ? 'Saving...' : 'Save onboarding'}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Notifications */}
      <CollapsibleSection title="Notifications" icon={Bell}>
        <div className="space-y-4">
          {Object.entries(settings.notifications.defaultPreferences).map(([key, value]) => (
            <label key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          notifications: {
                            ...s.notifications,
                            defaultPreferences: { ...s.notifications.defaultPreferences, [key]: e.target.checked },
                          },
                        }
                      : s
                  )
                }
                className="h-4 w-4 rounded border-[var(--pm-line)]"
              />
              <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
            </label>
          ))}
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection('notifications', {
                  defaultPreferences: settings.notifications.defaultPreferences,
                })
              }
              disabled={saving === 'notifications'}
            >
              {saving === 'notifications' ? 'Saving...' : 'Save notifications'}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Moderation */}
      <CollapsibleSection title="Moderation" icon={SlidersHorizontal}>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.moderation.autoModEnabled}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, moderation: { ...s.moderation, autoModEnabled: e.target.checked } } : s)
              }
              className="h-4 w-4 rounded border-[var(--pm-line)]"
            />
            <span className="text-sm">Enable auto-moderation</span>
          </label>
          <Input
            label="Minimum account age (days)"
            type="number"
            min={0}
            value={settings.moderation.minAccountAgeDays}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, moderation: { ...s.moderation, minAccountAgeDays: Number(e.target.value) } } : s
              )
            }
          />
          <Input
            label="Minimum reputation for posting"
            type="number"
            min={0}
            value={settings.moderation.minReputation}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, moderation: { ...s.moderation, minReputation: Number(e.target.value) } } : s
              )
            }
          />
          <div>
            <label htmlFor="defaultFlagAction" className="mb-1 block text-sm font-medium">Default flag action</label>
            <select
              id="defaultFlagAction"
              value={settings.moderation.defaultFlagAction}
              onChange={(e) =>
                setSettings((s) => s ? { ...s, moderation: { ...s.moderation, defaultFlagAction: e.target.value } } : s)
              }
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              <option value="auto_flag">Auto-flag</option>
              <option value="monitor">Monitor</option>
              <option value="block">Block</option>
            </select>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection('moderation', {
                  autoModEnabled: settings.moderation.autoModEnabled,
                  minAccountAgeDays: settings.moderation.minAccountAgeDays,
                  minReputation: settings.moderation.minReputation,
                  defaultFlagAction: settings.moderation.defaultFlagAction,
                })
              }
              disabled={saving === 'moderation'}
            >
              {saving === 'moderation' ? 'Saving...' : 'Save moderation'}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Analytics */}
      <CollapsibleSection title="Analytics" icon={BarChart3}>
        <div className="space-y-4">
          <Input
            label="PostHog API key"
            value={settings.analytics.posthogKey ?? ''}
            onChange={(e) =>
              setSettings((s) => s ? { ...s, analytics: { ...s.analytics, posthogKey: e.target.value || null } } : s)
            }
            placeholder="phc_..."
          />
          <Input
            label="Data retention (days)"
            type="number"
            min={1}
            value={settings.analytics.dataRetentionDays}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, analytics: { ...s.analytics, dataRetentionDays: Number(e.target.value) } } : s
              )
            }
          />
          <p className="text-sm font-medium text-[var(--pm-ink)]">Widget toggles</p>
          {Object.entries(settings.analytics.widgetToggles).map(([key, value]) => (
            <label key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          analytics: {
                            ...s.analytics,
                            widgetToggles: { ...s.analytics.widgetToggles, [key]: e.target.checked },
                          },
                        }
                      : s
                  )
                }
                className="h-4 w-4 rounded border-[var(--pm-line)]"
              />
              <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
            </label>
          ))}
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSection('analytics', {
                  posthogKey: settings.analytics.posthogKey,
                  dataRetentionDays: settings.analytics.dataRetentionDays,
                  widgetToggles: settings.analytics.widgetToggles,
                })
              }
              disabled={saving === 'analytics'}
            >
              {saving === 'analytics' ? 'Saving...' : 'Save analytics'}
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Integrations link */}
      <Card className="mb-4">
        <Link
          href="/admin/settings/integrations"
          className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-[var(--pm-paper-2)]"
        >
          <Puzzle className="h-5 w-5 text-[var(--pm-coral)]" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-lg font-medium">Integrations</p>
            <p className="text-sm text-[var(--pm-muted)]">Manage MCP client connections</p>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--pm-muted)]" />
        </Link>
      </Card>

      {/* Danger zone */}
      <Card className="mt-8 border-[var(--pm-danger)]">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <Trash2 className="h-5 w-5 text-[var(--pm-danger)]" />
            <h2 className="text-lg font-medium text-[var(--pm-danger)]">Danger zone</h2>
          </div>
          <p className="mt-2 text-sm text-[var(--pm-muted)]">
            Deleting the community is permanent and cannot be undone. All data will be removed.
          </p>

          {deleteStep === 'initial' && (
            <Button
              variant="secondary"
              className="mt-4 border-[var(--pm-danger)] text-[var(--pm-danger)]"
              onClick={() => setDeleteStep('confirm')}
            >
              Delete community
            </Button>
          )}

          {deleteStep === 'confirm' && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--pm-danger)] bg-[var(--pm-danger-bg)] p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--pm-danger)]" />
                <p className="text-sm text-[var(--pm-danger)]">
                  This action is irreversible. Type <strong>DELETE</strong> below to confirm.
                </p>
              </div>
              <Input
                value={deleteConfirm}
                onChange={(e) => {
                  setDeleteConfirm(e.target.value);
                  if (e.target.value === 'DELETE') setDeleteStep('typing');
                  else setDeleteStep('confirm');
                }}
                placeholder="Type DELETE to confirm"
              />
              <div className="flex gap-2">
                <Button
                  className="border-[var(--pm-danger)] text-[var(--pm-danger)]"
                  disabled={deleteConfirm !== 'DELETE'}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/v1/admin/settings', {
                        method: 'DELETE',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ confirm: true }),
                      });
                      if (!res.ok) throw new Error('Failed to delete community');
                      window.location.href = '/';
                    } catch (err: any) {
                      setMessage(err.message || 'Failed to delete community');
                    }
                  }}
                >
                  Permanently delete community
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDeleteStep('initial');
                    setDeleteConfirm('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
