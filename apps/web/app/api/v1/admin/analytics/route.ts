export const runtime = 'nodejs';

import { z } from '@pm-operator/api';
import {
  getDb,
  ok,
  requireSession,
  parseQuery,
  forbidden,
} from '@/lib/api/server';
import { requireGlobalAdmin } from '@/lib/services/admin';
import {
  getAnalyticsOverview,
  getMemberGrowth,
  getEngagementMetrics,
  getPostGrowth,
  getAdminDashboard,
  createPostHogClient,
} from '@/lib/services/analytics';

const analyticsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
  // 'dashboard' is additive (analytics v2, §4.5); the default and the legacy
  // sections are unchanged so the current admin KpiCards keep working.
  section: z
    .enum(['overview', 'members', 'engagement', 'dashboard'])
    .default('overview'),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const query = parseQuery(new URL(request.url).searchParams, analyticsQuerySchema);
  if (query instanceof Response) return query;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }

  const db = getDb();
  const days = query.period === '7d' ? 7 : query.period === '90d' ? 90 : 30;

  // Try PostHog but don't fail if unavailable
  const posthog = createPostHogClient();
  let posthogData: unknown = null;
  if (posthog) {
    try {
      const insight = await posthog.fetchInsight(1);
      if (insight) {
        posthogData = {
          name: insight.name,
          lastRefreshed: insight.last_refreshed,
        };
      }
    } catch {
      // PostHog data is optional
    }
  }

  switch (query.section) {
    case 'overview': {
      const overview = await getAnalyticsOverview(db);
      const memberGrowth = await getMemberGrowth(db, days);
      const postGrowth = await getPostGrowth(db, days);
      return ok({ overview, memberGrowth, postGrowth, posthog: posthogData });
    }

    case 'members': {
      const overview = await getAnalyticsOverview(db);
      const memberGrowth = await getMemberGrowth(db, days);
      return ok({ overview, memberGrowth, posthog: posthogData });
    }

    case 'dashboard': {
      const dashboard = await getAdminDashboard(db);
      return ok({ dashboard, posthog: posthogData });
    }

    case 'engagement': {
      const engagement = await getEngagementMetrics(db);
      return ok({ engagement, posthog: posthogData });
    }

    default:
      return ok({ posthog: posthogData });
  }
}
