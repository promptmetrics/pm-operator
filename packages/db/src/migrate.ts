import dotenv from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');

// Load env files from the workspace root and from the web app. This lets
// `pnpm --filter @pm-operator/db db:migrate` work regardless of the shell's
// current directory, as long as `apps/web/.env.local` exists.
dotenv.config({ path: path.resolve(workspaceRoot, '.env') });
dotenv.config({ path: path.resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: path.resolve(workspaceRoot, 'apps/web/.env.local') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Set it in apps/web/.env.local, .env.local, or .env in the workspace root.'
  );
}

const client = postgres(databaseUrl, { prepare: false, max: 1 });

// Per-migration transactions instead of drizzle's migrate(), which wraps ALL
// pending migrations in a single transaction. That batching breaks fresh
// databases: 0011's index predicate resolves the enum value added by 0010,
// and Postgres refuses to use an enum value in the transaction that added it
// (55P04). Journal semantics are identical to drizzle's migrator: same
// drizzle.__drizzle_migrations table, same pending-selection by created_at.
async function run() {
  const migrations = readMigrationFiles({ migrationsFolder: './migrations' });

  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
  const [lastDbMigration] = await client`
    SELECT id, hash, created_at FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC LIMIT 1
  `;

  let applied = 0;
  for (const migration of migrations) {
    if (lastDbMigration && Number(lastDbMigration.created_at) >= migration.folderMillis) {
      continue;
    }
    await client.begin(async (tx) => {
      for (const stmt of migration.sql) {
        await tx.unsafe(stmt);
      }
      await tx`
        INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at")
        VALUES (${migration.hash}, ${migration.folderMillis})
      `;
    });
    applied += 1;
  }

  console.log(`Migrations complete (${applied} applied).`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
