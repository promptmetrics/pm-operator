import 'server-only';

import { unstable_cache } from 'next/cache';
import { createServiceDb } from '@/lib/db';
import { listGroupStats, type GroupStatsMap } from './groups';

// Track 2C/3D: the ONE cached wrapper around the viewer-independent groups
// stats aggregate. The community layout rail, the /g directory, and
// GET /api/v1/groups?includeStats=1 all import THIS constant so they share a
// single 300 s cache entry — the key lives here and nowhere else, so it can
// never drift between call sites. Budget: 0 fresh queries warm, 1 cold; always
// await it AFTER (never concurrent with) a request path's fresh queries so the
// cold path stays sequential (pool = 3; see DESIGN-GAP-REPORT
// "Pool-starvation gotcha").
export const getCachedGroupStats = unstable_cache(
  async (): Promise<GroupStatsMap> => listGroupStats(createServiceDb()),
  ['groups-list-stats'],
  { revalidate: 300 }
);
