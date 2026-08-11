import { test, expect } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import { createTestUser, deleteTestUser, serviceDb, signIn } from './helpers';

// Regression guard for the audit-log enum bug (fixed 2026-08-11, migration
// 0024_aspiring_adam_warlock). PATCH /api/v1/admin/settings wrote the settings row
// and THEN threw inserting its audit row, because `settings_update` was not a
// member of the audit_log_action enum — so the change landed and the caller still
// got a 500, and a retry looked like it had worked the second time.
//
// Eight admin endpoints shared that shape. This spec covers the settings one
// because it had no coverage at all, which is why the bug shipped. The assertion
// that matters is the STATUS, not the stored value: asserting the value alone
// would have passed happily throughout the entire broken period.

const usersToClean: string[] = [];

test.afterEach(async () => {
  const db = serviceDb();
  for (const userId of usersToClean) {
    // Audit rows first. audit_logs.actor_id is NOT NULL but declares
    // ON DELETE SET NULL, so the user delete fails once audit rows point at them
    // — and deleteTestUser swallows errors, which would strand the user.
    await db
      .delete(schema.auditLogs)
      .where(eq(schema.auditLogs.actorId, userId))
      .catch(() => {});
    await deleteTestUser(userId).catch(() => {});
  }
  usersToClean.length = 0;
});

test('saving a settings section returns 200 and records an audit entry', async ({ page }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id);
  await signIn(page, admin.email, admin.password);

  // publicRegistration: true is already the default, so this is value-neutral —
  // the point is exercising the write path, not changing behaviour.
  const res = await page.request.patch('/api/v1/admin/settings', {
    data: { section: 'privacy', values: { publicRegistration: true } },
  });

  expect(res.status(), 'settings PATCH must not 500 on the audit insert').toBe(200);

  const rows = await serviceDb()
    .select({ action: schema.auditLogs.action, targetType: schema.auditLogs.targetType })
    .from(schema.auditLogs)
    .where(
      and(eq(schema.auditLogs.actorId, admin.id), eq(schema.auditLogs.action, 'settings_update'))
    );

  expect(rows.length, 'the audit row should exist, not have been rejected').toBeGreaterThan(0);
  expect(rows[0].targetType).toBe('settings');
});

test('an unknown settings section is rejected', async ({ page }) => {
  const admin = await createTestUser({ role: 'admin', onboardingComplete: true });
  usersToClean.push(admin.id);
  await signIn(page, admin.email, admin.password);

  // 'branding' was removed 2026-08-11 — the logo and favicon are shipped assets,
  // not settings. It stands in here for any unknown section.
  const res = await page.request.patch('/api/v1/admin/settings', {
    data: { section: 'branding', values: { logoUrl: 'https://example.com/logo.png' } },
  });

  expect(res.status()).toBe(400);
});
