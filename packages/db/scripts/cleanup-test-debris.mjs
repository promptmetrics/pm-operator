// One-off MANUAL cleanup script for E2E/CI test debris. NEVER wired into CI.
//
// Run it by hand, deliberately, against one database at a time:
//
//   DATABASE_URL='postgres://...' node packages/db/scripts/cleanup-test-debris.mjs                 # dry run (default)
//   DATABASE_URL='postgres://...' node packages/db/scripts/cleanup-test-debris.mjs --execute       # actually delete
//   DATABASE_URL='postgres://...' node packages/db/scripts/cleanup-test-debris.mjs --execute --include-seed
//
// Unlike reset-and-migrate.mjs this script deliberately does NOT load dotenv:
// the operator must paste DATABASE_URL into the environment so the script can
// never inherit a connection string from a stray .env file.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. This script does not read .env files — export the URL explicitly, e.g.\n' +
      "  DATABASE_URL='postgres://...' node packages/db/scripts/cleanup-test-debris.mjs"
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const includeSeed = args.has('--include-seed');

console.log(`Target database host: ${new URL(url).hostname}`);
console.log(
  execute
    ? 'Mode: EXECUTE — matched rows will be deleted in a single transaction.'
    : 'Mode: dry run — nothing is deleted. Re-run with --execute to delete.'
);

// Test-data patterns (see docs/TESTING.md "Test data conventions" and
// apps/web/e2e/helpers.ts). Timestamps are Date.now() ms (13 digits).
const TEST_EMAIL_RE = String.raw`^(member|moderator|admin|test)\.\d{13}\.[a-z0-9]{1,8}@example\.com$`;
const TEST_USERSLUG_RE = String.raw`^test-\d{13}-[a-z0-9]{1,8}$`;
const TEST_USERNAME_RE = String.raw`^(Test|Tmp) \d{13} [a-z0-9]{1,6}$`;
// Covers invite-only-/community-test-/any slugify(prefix)-{13-digit-ms-timestamp}-{rand};
// also catches test groups orphaned when their creator was deleted (owner SET NULL).
const TEST_GROUP_SLUG_RE = String.raw`-1\d{12}-[a-z0-9]{1,8}$`;
// Deterministic seed UUID prefix from packages/db/src/seed.ts.
const SEED_ID_PREFIX = '10000000-0000-0000-0000-%';

const sql = postgres(url, { max: 1 });

const testUserWhere = sql`
  email ~ ${TEST_EMAIL_RE}
  OR userslug ~ ${TEST_USERSLUG_RE}
  OR username ~ ${TEST_USERNAME_RE}
  OR username LIKE 'tmpuser%'
`;

function printSamples(rows, labelKey) {
  for (const row of rows) {
    const ts = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
    console.log(`    ${row.id}  ${row[labelKey] ?? '(null)'}  ${ts}`);
  }
}

async function countTestUsers() {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM public.users WHERE ${testUserWhere}`;
  return count;
}

async function countTestGroups() {
  const [{ count }] =
    await sql`SELECT count(*)::int AS count FROM public.groups WHERE slug ~ ${TEST_GROUP_SLUG_RE}`;
  return count;
}

async function countSeedUsers() {
  const [{ count }] =
    await sql`SELECT count(*)::int AS count FROM public.users WHERE id::text LIKE ${SEED_ID_PREFIX}`;
  return count;
}

// --- Report phase (always runs) -------------------------------------------

console.log('');

// 1. Test app users. Deleting from public.users cascades to memberships,
//    posts, comments, reactions, point_events, notifications, user_scores,
//    user_badges, and saved_posts (verified against the schema).
const userCount = await countTestUsers();
console.log(`test app users (public.users): ${userCount}`);
printSamples(
  await sql`SELECT id, email, created_at FROM public.users WHERE ${testUserWhere} ORDER BY created_at LIMIT 10`,
  'email'
);

// 2. Test groups. Deleting from public.groups cascades to memberships,
//    posts, and invites.
const groupCount = await countTestGroups();
console.log(`test groups (public.groups): ${groupCount}`);
printSamples(
  await sql`SELECT id, slug, created_at FROM public.groups WHERE slug ~ ${TEST_GROUP_SLUG_RE} ORDER BY created_at LIMIT 10`,
  'slug'
);

// 3. GoTrue debris. Plain-Postgres test targets have no auth schema, so probe
//    it up front and skip (with a warning) instead of failing.
let authAccessible = true;
let authCount = 0;
try {
  const [{ count }] =
    await sql`SELECT count(*)::int AS count FROM auth.users WHERE email ~ ${TEST_EMAIL_RE}`;
  authCount = count;
  console.log(`GoTrue debris (auth.users): ${authCount}`);
  printSamples(
    await sql`SELECT id, email, created_at FROM auth.users WHERE email ~ ${TEST_EMAIL_RE} ORDER BY created_at LIMIT 10`,
    'email'
  );
} catch (err) {
  authAccessible = false;
  console.warn(`warning: auth schema not accessible (${err.message}) — skipping GoTrue debris.`);
}

// 4a. Seed fixtures — report-only unless --include-seed AND --execute.
const seedCount = await countSeedUsers();
console.log(`seed fixtures — rerun with --include-seed to delete: ${seedCount}`);
printSamples(
  await sql`SELECT id, email, created_at FROM public.users WHERE id::text LIKE ${SEED_ID_PREFIX} ORDER BY created_at LIMIT 10`,
  'email'
);

// 4b. Unmatched example.com rows — never deleted by this script.
const unmatchedWhere = sql`
  email LIKE '%@example.com'
  AND NOT (${testUserWhere})
  AND id::text NOT LIKE ${SEED_ID_PREFIX}
`;
const [{ count: unmatchedCount }] =
  await sql`SELECT count(*)::int AS count FROM public.users WHERE ${unmatchedWhere}`;
console.log(`unmatched example.com rows — manual review: ${unmatchedCount}`);
printSamples(
  await sql`SELECT id, email, created_at FROM public.users WHERE ${unmatchedWhere} ORDER BY created_at LIMIT 10`,
  'email'
);

// --- Delete phase (--execute only) ----------------------------------------

if (!execute) {
  if (includeSeed) {
    console.log('\n--include-seed noted, but this is a dry run; add --execute to delete.');
  }
  console.log('\nDry run complete. Nothing was deleted.');
  await sql.end();
  process.exit(0);
}

console.log('\nDeleting in a single transaction...');
await sql.begin(async (tx) => {
  const users = await tx`DELETE FROM public.users WHERE ${testUserWhere}`;
  console.log(`  deleted ${users.count} test app users`);

  const groups = await tx`DELETE FROM public.groups WHERE slug ~ ${TEST_GROUP_SLUG_RE}`;
  console.log(`  deleted ${groups.count} test groups`);

  if (authAccessible) {
    const auth = await tx`DELETE FROM auth.users WHERE email ~ ${TEST_EMAIL_RE}`;
    console.log(`  deleted ${auth.count} auth.users rows`);
  } else {
    console.log('  skipped auth.users (schema not accessible)');
  }

  if (includeSeed) {
    const seed = await tx`DELETE FROM public.users WHERE id::text LIKE ${SEED_ID_PREFIX}`;
    console.log(`  deleted ${seed.count} seed fixture users (--include-seed)`);
  }
});

console.log('\nCounts after deletion:');
console.log(`  test app users: ${await countTestUsers()}`);
console.log(`  test groups: ${await countTestGroups()}`);
if (authAccessible) {
  const [{ count }] =
    await sql`SELECT count(*)::int AS count FROM auth.users WHERE email ~ ${TEST_EMAIL_RE}`;
  console.log(`  GoTrue debris: ${count}`);
}
console.log(`  seed fixtures: ${await countSeedUsers()}`);

await sql.end();
console.log('\nCleanup complete.');
