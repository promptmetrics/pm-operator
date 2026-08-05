'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ModerationSettings {
  autoModEnabled: boolean;
  minAccountAgeDays: number;
  minReputation: number;
  defaultFlagAction: string;
}

export default function AdminModerationSettingsPage() {
  const [settings, setSettings] = React.useState<ModerationSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/settings?section=moderation');
      if (!res.ok) throw new Error('Failed to load moderation settings');
      const json = (await res.json()) as { data?: { values: ModerationSettings } };
      setSettings(json.data?.values ?? null);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load moderation settings');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: 'moderation', values: settings }),
      });
      if (!res.ok) throw new Error('Failed to save moderation settings');
      setMessage('Moderation settings saved.');
    } catch (err: any) {
      setMessage(err.message || 'Failed to save moderation settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-[var(--pm-muted)]">Loading moderation settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-[var(--pm-danger)]">{message || 'Failed to load moderation settings'}</p>
        <Button variant="secondary" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/settings"
        className="mb-4 flex items-center gap-2 text-sm text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-ink)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <h1 className="mb-6 text-2xl font-semibold">Moderation defaults</h1>

      <Card className="mb-6 p-6">
        <CardContent className="space-y-6">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.autoModEnabled}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, autoModEnabled: e.target.checked } : s))
              }
              className="h-4 w-4 rounded border-[var(--pm-line)]"
            />
            <div>
              <p className="text-sm font-medium">Enable auto-moderation</p>
              <p className="text-xs text-[var(--pm-muted)]">
                Automatically flag content matching watched phrases
              </p>
            </div>
          </label>

          <Input
            label="Minimum account age (days)"
            type="number"
            min={0}
            value={settings.minAccountAgeDays}
            onChange={(e) =>
              setSettings((s) => (s ? { ...s, minAccountAgeDays: Number(e.target.value) } : s))
            }
            description="Accounts younger than this cannot post or comment"
          />

          <Input
            label="Minimum reputation for posting"
            type="number"
            min={0}
            value={settings.minReputation}
            onChange={(e) =>
              setSettings((s) => (s ? { ...s, minReputation: Number(e.target.value) } : s))
            }
            description="Users below this reputation cannot post or comment"
          />

          <div>
            <label htmlFor="defaultFlagAction" className="mb-1 block text-sm font-medium">Default flag action</label>
            <p className="mb-2 text-xs text-[var(--pm-muted)]">
              What happens when content is auto-flagged
            </p>
            <select
              id="defaultFlagAction"
              value={settings.defaultFlagAction}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, defaultFlagAction: e.target.value } : s))
              }
              className="h-10 w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3"
            >
              <option value="auto_flag">Auto-flag (flag for review)</option>
              <option value="monitor">Monitor (log only, no action)</option>
              <option value="block">Block (prevent posting)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {message ? (
        <p className={`mb-4 text-sm ${message.includes('saved') ? 'text-[var(--pm-green)]' : 'text-[var(--pm-danger)]'}`}>
          {message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save moderation'}
        </Button>
      </div>
    </div>
  );
}
