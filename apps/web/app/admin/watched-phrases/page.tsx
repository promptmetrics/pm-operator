'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import type { WatchedPhrase } from '@pm-operator/api';

export default function WatchedPhrasesPage() {
  const [phrases, setPhrases] = React.useState<WatchedPhrase[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [form, setForm] = React.useState({
    phrase: '',
    sanctionedFraming: '',
    isRegex: false,
    autoFlag: true,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/watched-phrases');
      if (!res.ok) throw new Error('Failed to load watched phrases');
      const json = (await res.json()) as { data?: { phrases: WatchedPhrase[] } };
      setPhrases(json.data?.phrases ?? []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load watched phrases');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/v1/admin/watched-phrases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create watched phrase');
      setForm({ phrase: '', sanctionedFraming: '', isRegex: false, autoFlag: true });
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to create watched phrase');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this watched phrase?')) return;
    try {
      const res = await fetch(`/api/v1/admin/watched-phrases?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete watched phrase');
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to delete watched phrase');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Watched phrases</h1>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Add phrase</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phrase"
            value={form.phrase}
            onChange={(e) => setForm((f) => ({ ...f, phrase: e.target.value }))}
            required
          />
          <Input
            label="Sanctioned framing"
            value={form.sanctionedFraming}
            onChange={(e) => setForm((f) => ({ ...f, sanctionedFraming: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isRegex}
              onChange={(e) => setForm((f) => ({ ...f, isRegex: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            Regex
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.autoFlag}
              onChange={(e) => setForm((f) => ({ ...f, autoFlag: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            Auto-flag
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Add phrase'}
            </Button>
          </div>
        </form>
        {message ? <p className="mt-4 text-sm text-error">{message}</p> : null}
      </Card>

      {loading && phrases.length === 0 ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {phrases.map((phrase) => (
            <Card key={phrase.id} className="p-4">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{phrase.phrase}</p>
                  <p className="text-sm text-muted-foreground">
                    {phrase.isRegex ? 'Regex' : 'Literal'} · {phrase.autoFlag ? 'Auto-flag' : 'Monitor'}
                    {phrase.sanctionedFraming ? ` · Suggested: "${phrase.sanctionedFraming}"` : null}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(phrase.id)}>
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
