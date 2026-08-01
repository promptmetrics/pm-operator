'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pm-operator/ui/components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pm-operator/ui/components/Card';
import { Input } from '@pm-operator/ui/components/Input';
import { Checkbox } from '@/components/ui/checkbox';
import { completeOnboarding } from './actions';

const STACK_OPTIONS = [
  'MCP',
  'Next.js',
  'Vercel',
  'LangChain',
  'OpenAI',
  'Authentication',
  'Evals',
  'Multi-agent orchestration',
  'Governance',
  'Storage',
  'Supabase',
  'Postgres',
  'Redis',
  'Observability',
  'Testing',
];

interface OnboardingFormProps {
  userId: string;
  email: string;
  fullName: string;
  returnUrl: string;
}

export function OnboardingForm({ userId, fullName, returnUrl }: OnboardingFormProps) {
  const router = useRouter();
  const [task, setTask] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [customTag, setCustomTag] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [isLoading, setIsLoading] = React.useState(false);

  const displayName = fullName || 'there';

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addCustomTag() {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    if (!selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setCustomTag('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!task.trim()) {
      setError('Describe the problem you are working on.');
      return;
    }

    setIsLoading(true);
    setError(undefined);

    const result = await completeOnboarding({
      userId,
      painfulToolStackTask: task.trim(),
      stackTags: selectedTags,
      returnUrl,
    });

    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push(returnUrl);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Welcome, {displayName}</CardTitle>
          <CardDescription>One question places you in the right circles.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="onboarding-form">
            <Input
              id="painful-tool-stack-task"
              label="What is the most painful tool-stack or agent problem you are working on right now?"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="I can't get MCP servers to authenticate consistently in our Next.js app."
              disabled={isLoading}
              error={error && !task.trim() ? error : undefined}
            />

            <div className="space-y-3">
              <p className="text-sm font-medium text-[var(--pm-ink)]">Stack tags</p>
              <div className="flex flex-wrap gap-3">
                {STACK_OPTIONS.map((tag) => (
                  <Checkbox
                    key={tag}
                    label={tag}
                    checked={selectedTags.includes(tag)}
                    onChange={() => toggleTag(tag)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="custom-tag"
                  placeholder="Add a custom tag"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                  disabled={isLoading}
                />
                <Button type="button" variant="secondary" onClick={addCustomTag} disabled={isLoading}>
                  Add
                </Button>
              </div>
              {selectedTags.length > 0 ? (
                <p className="text-sm text-[var(--pm-muted)]">
                  Selected: {selectedTags.join(', ')}
                </p>
              ) : null}
            </div>

            {error && task.trim() ? (
              <p className="text-sm text-[var(--pm-danger)]" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              Continue
            </Button>

            <p className="text-center text-sm text-[var(--pm-muted)]">
              Step 1 of 3 — tell us your focus
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
