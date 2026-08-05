'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';

interface BrandingSettings {
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  faviconUrl: string | null;
}

export default function AdminBrandingSettingsPage() {
  const [settings, setSettings] = React.useState<BrandingSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/settings?section=branding');
      if (!res.ok) throw new Error('Failed to load branding settings');
      const json = (await res.json()) as { data?: { values: BrandingSettings } };
      setSettings(json.data?.values ?? null);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load branding settings');
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
        body: JSON.stringify({ section: 'branding', values: settings }),
      });
      if (!res.ok) throw new Error('Failed to save branding settings');
      setMessage('Branding settings saved.');
    } catch (err: any) {
      setMessage(err.message || 'Failed to save branding settings');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logoUrl' | 'coverUrl' | 'faviconUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setSettings((s) => (s ? { ...s, [field]: dataUrl } : s));
    };
    reader.readAsDataURL(file);
  };

  if (loading && !settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-[var(--pm-muted)]">Loading branding settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-[var(--pm-danger)]">{message || 'Failed to load branding settings'}</p>
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

      <h1 className="mb-6 text-2xl font-semibold">Branding</h1>

      <Card className="mb-6 p-6">
        <CardContent className="space-y-6">
          <Input
            label="Community name"
            value={settings.name}
            onChange={(e) => setSettings((s) => (s ? { ...s, name: e.target.value } : s))}
          />

          <div>
            <label className="mb-1 block text-sm font-medium">Logo</label>
            <div className="flex items-center gap-4">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo preview" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] text-sm text-[var(--pm-muted)]">
                  No logo
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Input
                  label="Logo URL"
                  value={settings.logoUrl ?? ''}
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, logoUrl: e.target.value || null } : s))
                  }
                  placeholder="https://example.com/logo.png"
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--pm-coral)] hover:underline">
                  <Upload className="h-4 w-4" />
                  Upload file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'logoUrl')}
                  />
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Cover image</label>
            <div className="flex items-center gap-4">
              {settings.coverUrl ? (
                <img src={settings.coverUrl} alt="Cover preview" className="h-24 w-40 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] text-sm text-[var(--pm-muted)]">
                  No cover
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Input
                  label="Cover image URL"
                  value={settings.coverUrl ?? ''}
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, coverUrl: e.target.value || null } : s))
                  }
                  placeholder="https://example.com/cover.png"
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--pm-coral)] hover:underline">
                  <Upload className="h-4 w-4" />
                  Upload file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'coverUrl')}
                  />
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Favicon</label>
            <div className="flex items-center gap-4">
              {settings.faviconUrl ? (
                <img src={settings.faviconUrl} alt="Favicon preview" className="h-10 w-10 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] text-sm text-[var(--pm-muted)]">
                  No icon
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Input
                  label="Favicon URL"
                  value={settings.faviconUrl ?? ''}
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, faviconUrl: e.target.value || null } : s))
                  }
                  placeholder="https://example.com/favicon.ico"
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--pm-coral)] hover:underline">
                  <Upload className="h-4 w-4" />
                  Upload file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'faviconUrl')}
                  />
                </label>
              </div>
            </div>
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
          {saving ? 'Saving...' : 'Save branding'}
        </Button>
      </div>
    </div>
  );
}
