import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
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
const db = drizzle(client);

async function run() {
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
