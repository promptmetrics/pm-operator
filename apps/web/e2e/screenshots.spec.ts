// Redesign review pass: walk every redesigned route at desktop and phone
// widths, write PNGs, and emit one contact sheet you can scroll in a single
// pass against design/html/*.html (REDESIGN-PLAN.md §5.4).
//
// Not part of the normal e2e run — it seeds data and takes ~66 screenshots.
// Run it deliberately:
//
//   pnpm --filter @pm-operator/web screenshots
//
// then open apps/web/test-results/screenshots/contact-sheet.html.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { posts } from '@pm-operator/db';
import {
  createTestUser,
  deleteTestUser,
  signIn,
  dismissOverlays,
  createPublicGroup,
  createPublishedPost,
  serviceDb,
} from './helpers';

test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to capture the review pass');

// This spec SEEDS USERS AND CIRCLES. Running it against production would leave
// exactly the debris we spent 2026-08-02 cleaning out of prod. Same guard shape
// as packages/db/reset-and-migrate.mjs: local hosts are fine, any remote host
// must be armed explicitly.
function assertDisposableDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to seed screenshot fixtures');
  const host = new URL(url).hostname;
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (localHosts.has(host)) return;
  if (process.env.SCREENSHOTS_ALLOW_HOST === host) return;
  throw new Error(
    `Refusing to seed screenshot fixtures into non-local database host "${host}". ` +
      `Set SCREENSHOTS_ALLOW_HOST=${host} only if this is a disposable test database.`
  );
}

const VIEWPORTS = [
  { key: 'desktop', width: 1280, height: 900 },
  // 390x844 is an iPhone 14 viewport — below every breakpoint the redesign
  // uses (messages two-pane collapses at 800, admin reflows at 860).
  { key: 'mobile', width: 390, height: 844 },
] as const;

interface Shot {
  label: string;
  route: string;
  group: string;
}

/** Routes with no dynamic segment. Seeded routes are appended at run time. */
const STATIC_SHOTS: Shot[] = [
  { group: 'Auth & Onboarding', label: 'Landing', route: '/' },
  { group: 'Auth & Onboarding', label: 'Login', route: '/login' },
  { group: 'Auth & Onboarding', label: 'Register', route: '/register' },
  { group: 'Auth & Onboarding', label: 'Forgot password', route: '/forgot-password' },

  { group: 'Community', label: 'Feed', route: '/feed' },
  { group: 'Community', label: 'Circles directory', route: '/g' },
  { group: 'Community', label: 'Composer', route: '/post/new' },
  { group: 'Community', label: 'Leaderboards', route: '/leaderboards' },
  { group: 'Community', label: 'Bookmarks', route: '/bookmarks' },
  { group: 'Community', label: 'Weekly digest', route: '/digest' },

  { group: 'Utility', label: 'Search', route: '/search' },
  { group: 'Utility', label: 'Notifications', route: '/notifications' },
  { group: 'Utility', label: 'Messages', route: '/messages' },
  { group: 'Utility', label: 'Settings', route: '/settings' },

  { group: 'Moderation & Admin', label: 'Moderation queue', route: '/moderation' },
  { group: 'Moderation & Admin', label: 'Admin dashboard', route: '/admin' },
  { group: 'Moderation & Admin', label: 'Admin users', route: '/admin/users' },
  { group: 'Moderation & Admin', label: 'Admin circles', route: '/admin/groups' },
  { group: 'Moderation & Admin', label: 'Admin moderation', route: '/admin/moderation' },
  { group: 'Moderation & Admin', label: 'Admin approval queue', route: '/admin/moderation/approval' },
  { group: 'Moderation & Admin', label: 'Admin analytics', route: '/admin/analytics' },
  { group: 'Moderation & Admin', label: 'Admin members analytics', route: '/admin/analytics/members' },
  { group: 'Moderation & Admin', label: 'Admin badges', route: '/admin/badges' },
  { group: 'Moderation & Admin', label: 'Admin points', route: '/admin/points' },
  { group: 'Moderation & Admin', label: 'Admin events', route: '/admin/events' },
  { group: 'Moderation & Admin', label: 'Admin invites', route: '/admin/invites' },
  { group: 'Moderation & Admin', label: 'Admin leaderboards', route: '/admin/leaderboards' },
  { group: 'Moderation & Admin', label: 'Admin watched phrases', route: '/admin/watched-phrases' },
  { group: 'Moderation & Admin', label: 'Admin settings', route: '/admin/settings' },
];

const OUT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');

function fileFor(shot: Shot, viewport: string): string {
  const slug = shot.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${viewport}.png`;
}

async function settle(page: Page) {
  // networkidle would hang forever: the app holds an open realtime socket.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);
  await dismissOverlays(page).catch(() => {});
  // Freeze animation so consecutive runs are comparable.
  await page
    .addStyleTag({
      content: `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }`,
    })
    .catch(() => {});
}

function contactSheet(shots: Shot[], failures: Map<string, string>): string {
  const groups = [...new Set(shots.map((s) => s.group))];
  const sections = groups
    .map((group) => {
      const rows = shots
        .filter((s) => s.group === group)
        .map((s) => {
          const cells = VIEWPORTS.map((v) => {
            const key = `${s.label}:${v.key}`;
            const failure = failures.get(key);
            const inner = failure
              ? `<p class="failed">could not capture — ${failure}</p>`
              : `<img loading="lazy" src="./${fileFor(s, v.key)}" alt="${s.label} at ${v.width}px">`;
            return `<figure class="${v.key}"><figcaption>${v.width}×${v.height}</figcaption>${inner}</figure>`;
          }).join('');
          return `<section class="shot"><h3>${s.label} <code>${s.route}</code></h3><div class="pair">${cells}</div></section>`;
        })
        .join('');
      return `<h2>${group}</h2>${rows}`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Sea Glass redesign — screenshot contact sheet</title>
<style>
  body { margin: 0; padding: 2rem; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; background: #e9f1ee; color: #22302c; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  .hint { margin: 0 0 2rem; color: #5b6b66; }
  h2 { margin: 3rem 0 1rem; padding-bottom: .5rem; border-bottom: 2px solid #3f8f82; }
  .shot { margin: 0 0 2.5rem; }
  .shot h3 { margin: 0 0 .5rem; font-size: 1rem; font-weight: 600; }
  .shot code { font-weight: 400; color: #5b6b66; }
  .pair { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
  figure { margin: 0; background: #fff; border: 1px solid #cfdcd7; border-radius: 10px; padding: .5rem; }
  figure.desktop { flex: 3 1 640px; }
  figure.mobile { flex: 1 1 220px; max-width: 320px; }
  figcaption { font-size: .75rem; color: #5b6b66; margin-bottom: .4rem; }
  img { display: block; width: 100%; height: auto; border-radius: 6px; }
  .failed { color: #b8446a; font-size: .85rem; margin: 0; padding: 2rem 1rem; text-align: center; }
</style></head>
<body>
<h1>Sea Glass redesign — contact sheet</h1>
<p class="hint">Compare against the prototypes in <code>design/html/</code>. Desktop 1280×900, phone 390×844.</p>
${sections}
</body></html>`;
}

test('capture the redesigned screens at desktop and phone widths', async ({ browser }) => {
  assertDisposableDatabase();
  test.setTimeout(15 * 60 * 1000);

  mkdirSync(OUT_DIR, { recursive: true });

  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  try {
    const group = await createPublicGroup(admin.id);
    const postId = await createPublishedPost(group.id, admin.id, 'Sea Glass review post');
    const postRow = await serviceDb().query.posts.findFirst({
      where: eq(posts.id, postId),
      columns: { slug: true },
    });

    const shots: Shot[] = [
      ...STATIC_SHOTS,
      { group: 'Community', label: 'Circle', route: `/g/${group.slug}` },
      { group: 'Community', label: 'Post detail', route: `/g/${group.slug}/${postRow?.slug ?? ''}` },
      { group: 'Community', label: 'Profile', route: `/u/${admin.userslug}` },
      { group: 'Community', label: 'DevCard', route: `/u/${admin.userslug}/devcard` },
    ];

    const failures = new Map<string, string>();

    for (const viewport of VIEWPORTS) {
      // A fresh context per viewport so the app shell lays out for the size
      // from first paint rather than reflowing after a resize.
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const shotPage = await context.newPage();
      await signIn(shotPage, admin.email, admin.password);

      for (const shot of shots) {
        try {
          await shotPage.goto(shot.route, { waitUntil: 'commit' });
          await settle(shotPage);
          await shotPage.screenshot({
            path: path.join(OUT_DIR, fileFor(shot, viewport.key)),
            fullPage: true,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
          failures.set(`${shot.label}:${viewport.key}`, reason);
          // Keep going — one broken route must not cost you the other 65 shots.
          console.warn(`[screenshots] ${shot.route} @ ${viewport.key}: ${reason}`);
        }
      }

      await context.close();
    }

    const sheetPath = path.join(OUT_DIR, 'contact-sheet.html');
    writeFileSync(sheetPath, contactSheet(shots, failures));

    const total = shots.length * VIEWPORTS.length;
    const captured = total - failures.size;
    console.log(
      `\n[screenshots] ${captured}/${total} captured` +
        (failures.size ? ` (${failures.size} failed — listed in the sheet)` : '') +
        `\n[screenshots] open ${sheetPath}\n`
    );

    // The pass is for your eyes, not a pass/fail gate — but a run that captured
    // almost nothing means the setup broke, and that should be loud.
    expect(captured, 'most routes should have produced a screenshot').toBeGreaterThan(
      shots.length
    );
  } finally {
    await deleteTestUser(admin.id).catch(() => {});
  }
});
