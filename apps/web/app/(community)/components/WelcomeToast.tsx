'use client';

import * as React from 'react';
import { useToast } from '@pm-operator/ui/components/Toast';

// T8.10: fired on /feed?welcome=1 right after onboarding completes. Renders
// nothing visible itself — it just publishes a success toast naming the circles
// the user joined during Step 2 (read from preferences by the feed server page
// and passed in here), satisfying the spec's "success toast naming joined
// circles" verify point. Must mount within <ToastProvider> (the feed already
// uses useToast, so the provider is in place).
export function WelcomeToast({ names }: { names: string[] }) {
  const { toast } = useToast();

  React.useEffect(() => {
    const list = names.filter(Boolean);
    const title =
      list.length === 0
        ? "You're all set — welcome to the community!"
        : list.length === 1
          ? `You're now following ${list[0]}.`
          : list.length === 2
            ? `You're now following ${list[0]} and ${list[1]}.`
            : `You're now following ${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}.`;
    toast({ title, description: 'Your feed is ready below.', variant: 'success', duration: 6000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}