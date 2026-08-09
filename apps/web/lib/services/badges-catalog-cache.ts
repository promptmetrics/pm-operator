import 'server-only';

import { revalidateTag, unstable_cache } from 'next/cache';
import type { PublicBadge } from '@pm-operator/api';
import * as schema from '@pm-operator/db';
import { createServiceDb } from '@/lib/db';
import { toISO } from './shared';

// The ONE cached wrapper around the badge catalog, mirroring
// group-stats-cache.ts: the catalog is global (identical for every viewer) and
// changes only when an admin adds a badge, so a single 300 s entry serves all
// viewers. Everything that needs the catalog imports THIS constant — the cache
// key lives here and nowhere else, so it can never drift between call sites
// (unstable_cache keys on function identity as well as the key array).
//
// Takes NO arguments and closes over NO per-request state: passing a viewer id
// (or a request-scoped db) in here would poison the shared entry.
//
// Budget: 0 queries warm, 1 cold. Callers must await it SEQUENTIALLY — never
// inside a Promise.all beside fresh queries — so the cold path cannot widen a
// wave (pool = 3; see DESIGN-GAP-REPORT "Pool-starvation gotcha").

/**
 * A catalog row split into the already-public badge shape plus its raw
 * `criteria` jsonb. Both halves are JSON-safe by construction (`createdAt` is
 * serialized to an ISO string here, not left as a Date), so a cache hit returns
 * exactly what a cache miss returns.
 */
export interface CatalogBadge {
  badge: PublicBadge;
  criteria: unknown;
}

const BADGE_CATALOG_TAG = 'badges-catalog';

export const getCachedBadgeCatalog = unstable_cache(
  async (): Promise<CatalogBadge[]> => {
    const rows = await createServiceDb().query.badges.findMany({
      orderBy: [schema.badges.sortOrder, schema.badges.createdAt],
    });
    return rows.map((row) => ({
      badge: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        iconUrl: row.iconUrl,
        sortOrder: row.sortOrder,
        createdAt: toISO(row.createdAt),
      },
      criteria: row.criteria,
    }));
  },
  ['badges-catalog'],
  { revalidate: 300, tags: [BADGE_CATALOG_TAG] }
);

/**
 * Drop the cached catalog immediately. Without this, a badge an admin just
 * created stays invisible on every profile and DevCard for up to the 300 s TTL.
 * Call it from a route handler or server action after any badge mutation.
 */
export function revalidateBadgeCatalog(): void {
  // Next 16's revalidateTag takes a cache-life profile as its second argument;
  // `expire: 0` purges the entry now rather than letting it age out.
  revalidateTag(BADGE_CATALOG_TAG, { expire: 0 });
}
