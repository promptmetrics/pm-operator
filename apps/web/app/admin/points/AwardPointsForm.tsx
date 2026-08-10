'use client';

import * as React from 'react';
import { Button } from '@pm-operator/ui/components/Button';
import { Card, CardContent } from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { Coins, CheckCircle, AlertCircle } from 'lucide-react';

export default function AwardPointsForm() {
  const [userSlug, setUserSlug] = React.useState('');
  const [points, setPoints] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSlug || !points || !reason) {
      setResult({ success: false, message: 'All fields are required.' });
      return;
    }

    const pointsNum = Number(points);
    if (!Number.isFinite(pointsNum) || pointsNum <= 0) {
      setResult({ success: false, message: 'Points must be a positive number.' });
      return;
    }

    setSaving(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/admin/points', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userSlug, points: pointsNum, reason }),
      });

      if (!res.ok) {
        const errJson = (await res.json()) as { error?: { message?: string } };
        throw new Error(errJson.error?.message || 'Failed to award points');
      }

      setResult({ success: true, message: `Successfully awarded ${pointsNum} points to "${userSlug}".` });
      setUserSlug('');
      setPoints('');
      setReason('');
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Failed to award points' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Coins className="h-7 w-7 text-[var(--pm-coral)]" />
        <h2 className="text-xl font-semibold">Award Points</h2>
      </div>

      <Card className="mb-6 p-6">
        <CardContent>
          <p className="mb-6 text-sm text-[var(--pm-muted)]">
            Manually award points to a user. This creates a <strong>manual_award</strong> point event
            and updates the user&apos;s reputation score and leaderboard position.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="User slug"
              placeholder="e.g. jane-doe"
              value={userSlug}
              onChange={(e) => setUserSlug(e.target.value)}
              required
            />

            <Input
              label="Points"
              type="number"
              min={1}
              step="any"
              placeholder="e.g. 50"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              required
            />

            <div>
              <label className="mb-1 block text-sm font-medium">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are these points being awarded?"
                rows={3}
                required
                className="w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3 py-2 text-sm"
              />
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Awarding...' : 'Award points'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result feedback */}
      {result && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            result.success
              ? 'border-green-200 bg-green-50'
              : 'border-[var(--pm-danger)] bg-red-50'
          }`}
        >
          {result.success ? (
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pm-danger)]" />
          )}
          <p className={`text-sm ${result.success ? 'text-green-700' : 'text-[var(--pm-danger)]'}`}>
            {result.message}
          </p>
        </div>
      )}
    </>
  );
}
