// IndexNow pings on post publish/edit/hide (audit item 13). Bing/Yandex/Naver
// only — Google ignores the protocol — so this is Copilot/Bing discovery, not
// a Google-indexing lever. Mirrors the loopsSend degradation contract: when
// INDEXNOW_KEY is unset every ping is a logged no-op, and a failed ping can
// NEVER break the calling create/update flow.
//
// The key file is served at /{INDEXNOW_KEY}.txt via a rewrite in
// next.config.ts to /api/indexnow-key, so key rotation is one env change.

import 'server-only';
import { logger } from '@/lib/logger';
import { getPublicSiteUrl } from '@/lib/site-url';

const INDEXNOW_KEY = process.env.INDEXNOW_KEY;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * Fire-and-forget: not awaited by callers, so a slow endpoint cannot add
 * latency to publishes. On serverless the response may already be sent when
 * this runs — a dropped ping now and then is acceptable for a best-effort
 * protocol (the 3s timeout caps the tail either way).
 */
export function pingIndexNow(urls: string[]): void {
  if (!INDEXNOW_KEY) {
    logger.info({ urls }, 'indexnow: skipped (INDEXNOW_KEY not set)');
    return;
  }
  if (urls.length === 0) return;

  const siteUrl = getPublicSiteUrl();
  void fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(siteUrl).host,
      key: INDEXNOW_KEY,
      keyLocation: `${siteUrl}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
    signal: AbortSignal.timeout(3000),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn({ status: res.status, urls }, 'indexnow: ping rejected');
      }
    })
    .catch((err) => {
      logger.warn({ err, urls }, 'indexnow: ping failed');
    });
}
