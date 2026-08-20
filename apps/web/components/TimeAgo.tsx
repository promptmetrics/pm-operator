import { timeAgo } from '@/lib/format';

// Relative dates ("9d ago") wrapped in <time datetime> so crawlers get the
// machine-readable instant the label approximates. Hook-free on purpose: it
// renders in both server and client trees.
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} className={className}>
      {timeAgo(iso)}
    </time>
  );
}
