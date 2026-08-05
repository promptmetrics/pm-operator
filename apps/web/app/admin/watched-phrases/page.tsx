'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { ConfirmDialog } from '@pm-operator/ui/components/ConfirmDialog';
import { Input } from '@pm-operator/ui/components/Input';
import { useToast } from '@pm-operator/ui/components/Toast';
import type { WatchedPhrase } from '@pm-operator/api';
import { ToggleLeft, ToggleRight, Sparkles, Shield, AlertTriangle } from 'lucide-react';

type RuleAction = 'auto_flag' | 'monitor' | 'block';

interface PhraseWithMeta extends WatchedPhrase {
  action: RuleAction;
  enabled: boolean;
  exemptions: { roles: string[]; circles: string[] };
}

const RULE_PRESETS = [
  {
    name: 'Spam keywords',
    phrases: ['buy now', 'click here', 'free money', 'act now', 'limited offer'],
    description: 'Common spam and promotional phrases',
  },
  {
    name: 'Harassment patterns',
    phrases: ['\\b(idiot|stupid|dumb)\\b', '\\b(hate|kill|die)\\b'],
    description: 'Common harassment and toxic language patterns (regex)',
  },
  {
    name: 'NSFW detection',
    phrases: ['\\b(nsfw|explicit|\\+18)\\b'],
    description: 'Not-safe-for-work content markers',
  },
];

export default function WatchedPhrasesPage() {
  const [phrases, setPhrases] = React.useState<PhraseWithMeta[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [deletePhraseId, setDeletePhraseId] = React.useState<string | null>(null);
  const [regexError, setRegexError] = React.useState('');
  const { toast } = useToast();
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
      const raw = json.data?.phrases ?? [];
      setPhrases(
        raw.map((p) => ({
          ...p,
          action: p.autoFlag ? 'auto_flag' as RuleAction : 'monitor' as RuleAction,
          enabled: true,
          exemptions: { roles: [], circles: [] },
        }))
      );
    } catch (err: any) {
      setMessage(err.message || 'Failed to load watched phrases');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const validateRegex = (phrase: string, isRegex: boolean): boolean => {
    if (!isRegex) return true;
    try {
      new RegExp(phrase);
      setRegexError('');
      return true;
    } catch (e: any) {
      setRegexError(`Invalid regex: ${e.message}`);
      return false;
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRegex(form.phrase, form.isRegex)) return;

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
    try {
      const res = await fetch(`/api/v1/admin/watched-phrases?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete watched phrase');
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to delete watched phrase', variant: 'error' });
    }
  };

  const toggleEnabled = (id: string) => {
    setPhrases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const setAction = (id: string, action: RuleAction) => {
    setPhrases((prev) =>
      prev.map((p) => (p.id === id ? { ...p, action } : p))
    );
  };

  const applyPreset = async (preset: typeof RULE_PRESETS[0]) => {
    setSaving(true);
    try {
      for (const phrase of preset.phrases) {
        const isRegex = phrase.startsWith('\\b') || phrase.startsWith('\\(');
        if (!validateRegex(phrase, isRegex)) continue;

        await fetch('/api/v1/admin/watched-phrases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            phrase,
            isRegex,
            autoFlag: true,
          }),
        });
      }
      toast({ title: `Preset "${preset.name}" applied`, variant: 'success' });
      await load();
    } catch (err: any) {
      toast({ title: err.message || 'Failed to apply preset', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Watched phrases</h1>

      {/* Rule presets */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-[var(--pm-coral)]" />
            <h2 className="text-lg font-medium">Rule presets</h2>
          </div>
          <p className="mb-4 text-sm text-[var(--pm-muted)]">
            One-click enable common moderation rule sets
          </p>
          <div className="flex flex-wrap gap-3">
            {RULE_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(preset)}
                disabled={saving}
                title={preset.description}
              >
                <Shield className="mr-1 h-4 w-4" />
                {preset.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add phrase form */}
      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium">Add phrase</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phrase"
            value={form.phrase}
            onChange={(e) => {
              setForm((f) => ({ ...f, phrase: e.target.value }));
              if (form.isRegex) validateRegex(e.target.value, true);
            }}
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
              onChange={(e) => {
                setForm((f) => ({ ...f, isRegex: e.target.checked }));
                if (e.target.checked) setRegexError('');
              }}
              className="h-4 w-4 rounded border-[var(--pm-line)]"
            />
            Regex
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.autoFlag}
              onChange={(e) => setForm((f) => ({ ...f, autoFlag: e.target.checked }))}
              className="h-4 w-4 rounded border-[var(--pm-line)]"
            />
            Auto-flag
          </label>
          {regexError && (
            <div className="col-span-full flex items-center gap-1.5 text-sm text-[var(--pm-danger)]">
              <AlertTriangle className="h-4 w-4" />
              {regexError}
            </div>
          )}
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Add phrase'}
            </Button>
          </div>
        </form>
        {message ? <p className="mt-4 text-sm text-[var(--pm-danger)]">{message}</p> : null}
      </Card>

      {/* Phrase list with rule engine */}
      {loading && phrases.length === 0 ? (
        <p className="text-[var(--pm-muted)]">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {phrases.map((phrase) => (
            <Card key={phrase.id} className="p-4">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{phrase.phrase}</p>
                    <p className="text-sm text-[var(--pm-muted)]">
                      {phrase.isRegex ? 'Regex' : 'Literal'}
                      {phrase.sanctionedFraming
                        ? ` · Suggested: "${phrase.sanctionedFraming}"`
                        : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Enable/disable toggle */}
                    <button
                      onClick={() => toggleEnabled(phrase.id)}
                      className="text-[var(--pm-muted)] hover:text-[var(--pm-ink)]"
                      title={phrase.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {phrase.enabled ? (
                        <ToggleRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletePhraseId(phrase.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Action selector */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name={`action-${phrase.id}`}
                      checked={phrase.action === 'auto_flag'}
                      onChange={() => setAction(phrase.id, 'auto_flag')}
                      className="h-4 w-4"
                    />
                    Auto-flag
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name={`action-${phrase.id}`}
                      checked={phrase.action === 'monitor'}
                      onChange={() => setAction(phrase.id, 'monitor')}
                      className="h-4 w-4"
                    />
                    Monitor
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name={`action-${phrase.id}`}
                      checked={phrase.action === 'block'}
                      onChange={() => setAction(phrase.id, 'block')}
                      className="h-4 w-4"
                    />
                    Block
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        destructive
        open={deletePhraseId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletePhraseId(null);
        }}
        title="Delete this watched phrase?"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deletePhraseId) await remove(deletePhraseId);
        }}
      />
    </div>
  );
}
