import {
  AtSign,
  Award,
  ArrowBigUp,
  Bell,
  CheckCircle2,
  Flag,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Notification, NotificationType } from '@pm-operator/api';

/**
 * Icon + tint per notification type.
 *
 * The mockup designs six treatments; the enum ships ten. The six designed ones
 * are mapped 1:1 below (`designed: true`). The four the mockup never drew fall
 * back to the neutral paper-2 chip the mockup uses for its low-salience rows,
 * with a distinct icon so they stay scannable — except `flag`, which is a
 * warning and would read wrong as neutral, so it takes the amber tone
 * SCREEN-DESIGNS already prescribes for flags.
 */
export interface NotificationTreatment {
  icon: LucideIcon;
  /** Tailwind classes for the round icon chip. */
  chipClassName: string;
  designed: boolean;
}

const NEUTRAL = 'bg-[var(--pm-paper-2)] text-[var(--pm-ink-2)]';

const TREATMENTS: Record<NotificationType, NotificationTreatment> = {
  // --- designed in the mockup ---
  solution: {
    icon: CheckCircle2,
    chipClassName:
      'bg-[color-mix(in_srgb,var(--pm-teal)_16%,transparent)] text-[var(--pm-teal-dark)]',
    designed: true,
  },
  comment: {
    icon: MessageSquare,
    chipClassName: 'bg-[var(--pm-coral-tint)] text-[var(--pm-coral-dark)]',
    designed: true,
  },
  mention: {
    icon: AtSign,
    chipClassName: 'bg-[var(--pm-blue-bg)] text-[var(--pm-blue)]',
    designed: true,
  },
  reaction: { icon: ArrowBigUp, chipClassName: NEUTRAL, designed: true },
  badge: {
    icon: Award,
    chipClassName: 'bg-[var(--pm-amber-bg)] text-[var(--pm-amber)]',
    designed: true,
  },
  new_follower: { icon: UserPlus, chipClassName: NEUTRAL, designed: true },

  // --- not in the mockup: default treatment ---
  invite: { icon: Users, chipClassName: NEUTRAL, designed: false },
  new_message: { icon: Mail, chipClassName: NEUTRAL, designed: false },
  flag_resolved: { icon: ShieldCheck, chipClassName: NEUTRAL, designed: false },
  flag: {
    icon: Flag,
    chipClassName: 'bg-[var(--pm-amber-bg)] text-[var(--pm-amber)]',
    designed: false,
  },
};

const FALLBACK: NotificationTreatment = {
  icon: Bell,
  chipClassName: NEUTRAL,
  designed: false,
};

export function notificationTreatment(
  type: NotificationType
): NotificationTreatment {
  return TREATMENTS[type] ?? FALLBACK;
}

/**
 * Actor / circle context line under the notification text, built purely from
 * the denormalized payload — never a per-row fetch (see the 2026-08-02 pool
 * starvation incident).
 */
export function notificationContext(n: Notification): string | null {
  const parts: string[] = [];
  if (n.payload.actorUsername) parts.push(`@${n.payload.actorUsername}`);
  if (n.payload.groupSlug) parts.push(`circle/${n.payload.groupSlug}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
