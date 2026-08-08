import type { BadgeVariant } from '@pm-operator/ui/components/Badge';
import { toPlainText, truncateAtWord } from '@/lib/format';

/**
 * Presentation mapping for moderation flags, shared by FlagCard and the
 * moderation queue.
 *
 * The flags table stores a single free-text `reason` column. FlagDialog writes
 * either one of its canonical radio values or, when the reporter picks "Other",
 * the reporter's own words; the watched-phrase auto-flagger writes a sentence
 * describing the match. So the reason pill and the reporter note are two views
 * of that one column rather than two separate fields.
 */

export const CANONICAL_REASONS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  misinformation: 'Misinformation',
  off_topic: 'Off-topic',
  other: 'Other',
};

export const KIND_LABELS: Record<string, string> = {
  post: 'Post',
  comment: 'Comment',
  message: 'DM',
};

const KIND_VARIANTS: Record<string, BadgeVariant> = {
  post: 'blue',
  comment: 'teal',
  message: 'default',
};

export function kindPill(targetType: string): { label: string; variant: BadgeVariant } {
  return {
    label: KIND_LABELS[targetType] ?? targetType,
    variant: KIND_VARIANTS[targetType] ?? 'outline',
  };
}

export function reasonPill(flag: {
  reason: string | null;
  autoFlagged: boolean;
}): { label: string; variant: BadgeVariant } | null {
  // Auto-flags only ever come from the watched-phrase matcher, so their reason
  // text describes the match rather than naming a category a reporter chose.
  if (flag.autoFlagged) return { label: 'Watched phrase', variant: 'amber' };
  if (!flag.reason) return null;
  return { label: CANONICAL_REASONS[flag.reason] ?? 'Other', variant: 'coral' };
}

/**
 * The reporter's own words, when there are any. A reason that is exactly one of
 * the canonical values carries nothing beyond the pill, so it is not repeated.
 */
export function reporterNote(flag: {
  reason: string | null;
  autoFlagged: boolean;
}): string | null {
  if (!flag.reason) return null;
  if (!flag.autoFlagged && CANONICAL_REASONS[flag.reason]) return null;
  return flag.reason;
}

/**
 * Outcome wording for resolution receipts. `resolved` is the queue's
 * hide-the-content action (moderation.resolveFlag flips the target to
 * `hidden`); `dismissed` closes the flag and leaves the content in place.
 */
export const OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Content hidden',
  dismissed: 'Dismissed, no action',
};

const OUTCOME_VARIANTS: Record<string, BadgeVariant> = {
  resolved: 'green',
  dismissed: 'default',
};

export function outcomeBadge(
  status: string
): { label: string; variant: BadgeVariant } | null {
  const label = OUTCOME_LABELS[status];
  if (!label) return null;
  return { label, variant: OUTCOME_VARIANTS[status] ?? 'default' };
}

export const EXCERPT_MAX = 240;

/**
 * Build the quoted excerpt shown on a queue card. `message` targets store plain
 * text (messages.contentPlain); posts and comments store rich-text HTML.
 */
export function buildExcerpt(
  content: string | null,
  targetType: string
): { text: string; truncated: boolean } | null {
  if (!content) return null;
  const flat =
    targetType === 'message' ? content.replace(/\s+/g, ' ').trim() : toPlainText(content);
  if (!flat) return null;
  return truncateAtWord(flat, EXCERPT_MAX);
}
