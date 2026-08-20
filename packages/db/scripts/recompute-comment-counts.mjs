// One-off MANUAL reconciliation for posts.comment_count. NEVER wired into CI.
//
//   DATABASE_URL='postgres://...' node packages/db/scripts/recompute-comment-counts.mjs             # dry run (default)
//   DATABASE_URL='postgres://...' node packages/db/scripts/recompute-comment-counts.mjs --execute   # write corrected counts
//
// Like cleanup-test-debris.mjs, this deliberately does NOT load dotenv: the
// operator must paste DATABASE_URL into the environment so the script can never
// inherit a connection string from a stray .env file.
//
// posts.comment_count is owned by the trg_comment_count trigger (migration
// 0001), which counts exactly `status = 'published'`. Application code never
// writes the column. So a drift means one of:
//   - the trigger is missing from this database (apply-missing-fixes.mjs exists
//     precisely because migration-0001 objects have gone missing before), or
//   - rows were changed while it was missing, or
//   - someone hand-edited comments.
// The trigger check below runs first for that reason: recomputing without it
// installed just re-opens the same hole on the next comment.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'DATABASE_URL is not set. This script does not read .env files — export the URL explicitly, e.g.\n' +
      "  DATABASE_URL='postgres://...' node packages/db/scripts/recompute-comment-counts.mjs"
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');

console.log(`Target database host: ${new URL(url).hostname}`);
console.log(
  execute
    ? 'Mode: EXECUTE — drifted counts will be corrected in a single transaction.'
    : 'Mode: dry run — nothing is written. Re-run with --execute to correct.'
);

const sql = postgres(url, { max: 1 });

// --- 1. The trigger must exist, or the fix is cosmetic --------------------

const [{ present }] = await sql`
  SELECT count(*)::int > 0 AS present
  FROM pg_trigger
  WHERE tgname = 'trg_comment_count'
    AND tgrelid = 'public.comments'::regclass
    AND NOT tgisinternal
`;

if (!present) {
  console.error(
    '\nFATAL: trg_comment_count is NOT installed on public.comments.\n' +
      'Recomputing now would drift again on the very next comment. Reinstall it first:\n' +
      "  DATABASE_URL='...' node packages/db/apply-missing-fixes.mjs\n" +
      'then re-run this script.'
  );
  await sql.end();
  process.exit(1);
}
console.log('trg_comment_count: installed');

// --- 2. Report the drift -------------------------------------------------

const drift = await sql`
  SELECT p.id,
         p.slug,
         p.comment_count AS stored,
         count(c.id)::int AS actual
  FROM public.posts p
  LEFT JOIN public.comments c
    ON c.post_id = p.id AND c.status = 'published'
  GROUP BY p.id, p.slug, p.comment_count
  HAVING p.comment_count <> count(c.id)::int
  ORDER BY abs(p.comment_count - count(c.id)::int) DESC
`;

const [{ count: postCount }] = await sql`SELECT count(*)::int AS count FROM public.posts`;
console.log(`\nposts checked: ${postCount}`);
console.log(`posts with drifted comment_count: ${drift.length}`);

for (const row of drift.slice(0, 25)) {
  const delta = row.actual - row.stored;
  console.log(
    `    ${row.id}  ${row.slug ?? '(null)'}  stored=${row.stored} actual=${row.actual} (${delta > 0 ? '+' : ''}${delta})`
  );
}
if (drift.length > 25) console.log(`    … and ${drift.length - 25} more`);

// --- 3. Orphaned replies: counted but unreachable ------------------------
//
// A published reply under a hidden or deleted parent is counted by the trigger
// but never rendered — listCommentsForPost only fetches replies beneath root
// comments the viewer can see. services/comments.ts now cascades hide/delete to
// replies so this cannot accumulate going forward; this reports the backlog.

const orphans = await sql`
  SELECT c.id, c.post_id, parent.status AS parent_status
  FROM public.comments c
  JOIN public.comments parent ON parent.id = c.parent_comment_id
  WHERE c.status = 'published'
    AND parent.status <> 'published'
`;

console.log(`\npublished replies under a non-published parent: ${orphans.length}`);
for (const row of orphans.slice(0, 25)) {
  console.log(`    ${row.id}  post=${row.post_id}  parent_status=${row.parent_status}`);
}
if (orphans.length > 25) console.log(`    … and ${orphans.length - 25} more`);
if (orphans.length > 0) {
  console.log(
    '  These stay counted until their parent status is applied to them.\n' +
      '  --execute hides them to match their parent, which the trigger then decrements.'
  );
}

// --- 4. Write phase (--execute only) ------------------------------------

if (!execute) {
  console.log('\nDry run complete. Nothing was written.');
  await sql.end();
  process.exit(0);
}

if (drift.length === 0 && orphans.length === 0) {
  console.log('\nNothing to correct.');
  await sql.end();
  process.exit(0);
}

console.log('\nCorrecting in a single transaction...');
await sql.begin(async (tx) => {
  // Orphans first: applying the parent's status fires the trigger, so the
  // recompute below sees the settled state rather than fighting it.
  const hidden = await tx`
    UPDATE public.comments c
    SET status = parent.status, updated_at = now()
    FROM public.comments parent
    WHERE parent.id = c.parent_comment_id
      AND c.status = 'published'
      AND parent.status <> 'published'
  `;
  console.log(`  applied parent status to ${hidden.count} orphaned replies`);

  const fixed = await tx`
    UPDATE public.posts p
    SET comment_count = sub.actual
    FROM (
      SELECT p2.id, count(c.id)::int AS actual
      FROM public.posts p2
      LEFT JOIN public.comments c
        ON c.post_id = p2.id AND c.status = 'published'
      GROUP BY p2.id
    ) sub
    WHERE sub.id = p.id AND p.comment_count <> sub.actual
  `;
  console.log(`  corrected comment_count on ${fixed.count} posts`);
});

const [{ count: remaining }] = await sql`
  SELECT count(*)::int AS count FROM (
    SELECT p.id
    FROM public.posts p
    LEFT JOIN public.comments c
      ON c.post_id = p.id AND c.status = 'published'
    GROUP BY p.id, p.comment_count
    HAVING p.comment_count <> count(c.id)::int
  ) drifted
`;
console.log(`\nposts still drifted after correction: ${remaining}`);

await sql.end();
console.log('\nReconciliation complete.');
