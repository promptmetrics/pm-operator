import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { HeartHandshake } from 'lucide-react';
import { Card, CardContent, CardTitle } from '@pm-operator/ui/components/Card';
import { FeedFilter, FeedSort } from '@pm-operator/api';
import { createServiceDb } from '@/lib/db';
import { listFeed } from '@/lib/services/posts';
import { timeAgo } from '@/lib/format';

// "Help someone today" rail widget (plan §4.8): 1–2 questions that are still
// unanswered after 4 hours, on the feed's right rail, nudging members toward
// answering instead of only posting.
const HELP_QUEUE_MIN_AGE_MS = 4 * 60 * 60 * 1000;

export interface HelpQueueItem {
  id: string;
  title: string;
  href: string;
  groupName: string;
  createdAt: string;
}

// NOT viewer-specific by design: fetched with an anonymous visibility scope
// (public circles only), so one cache entry serves every viewer. ONE query on
// a cold cache, zero on the feed's request path for the next 5 minutes.
export const getHelpQueue = unstable_cache(
  async (): Promise<HelpQueueItem[]> => {
    const db = createServiceDb();
    const { posts } = await listFeed(
      db,
      { filter: FeedFilter.UNANSWERED, sort: FeedSort.NEW, page: 1, limit: 2 },
      undefined,
      { createdBefore: new Date(Date.now() - HELP_QUEUE_MIN_AGE_MS) }
    );
    // Cache only the fields the card renders — keeps the entry small and free
    // of short-lived signed asset URLs.
    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      href: `/g/${post.group.slug}/${post.slug}`,
      groupName: post.group.name,
      createdAt: post.createdAt,
    }));
  },
  ['feed-help-queue'],
  { revalidate: 300 }
);

export function HelpSomeoneCard({ items }: { items: HelpQueueItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card data-testid="help-someone-card">
      <CardContent className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartHandshake className="h-4 w-4 text-[var(--pm-coral)]" aria-hidden="true" />
          Help someone today
        </CardTitle>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Link
                href={item.href}
                className="font-medium text-[var(--pm-ink)] hover:text-[var(--pm-coral)]"
              >
                {item.title}
              </Link>
              <p className="mt-0.5 text-xs text-[var(--pm-muted)]">
                {item.groupName} · {timeAgo(item.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
