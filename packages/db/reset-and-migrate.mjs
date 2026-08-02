import dotenv from 'dotenv';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.resolve(workspaceRoot, '.env') });
dotenv.config({ path: path.resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: path.resolve(workspaceRoot, 'apps/web/.env.local') });

if (process.env.NODE_ENV === 'production') {
  throw new Error('This reset script must not run in production');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

// Destructive-target guard: local hosts are always allowed; any remote host
// must be explicitly armed via RESET_DB_ALLOW_HOST so this script can never
// drop the production schema by inherited env.
const host = new URL(url).hostname;
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const isRemoteArmed = process.env.RESET_DB_ALLOW_HOST === host;
if (!localHosts.has(host) && !isRemoteArmed) {
  throw new Error(
    `Refusing to reset non-local database host "${host}". ` +
      `Set RESET_DB_ALLOW_HOST=${host} explicitly if this is a disposable test database.`
  );
}

const args = new Set(process.argv.slice(2));
const wipeAuth = args.has('--wipe-auth');
const skipSeed = args.has('--no-seed');

const sql = postgres(url, { max: 1 });

console.log(`Resetting database at ${host}...`);
console.log('Dropping public and drizzle schemas...');
await sql`DROP SCHEMA IF EXISTS public CASCADE;`;
await sql`DROP SCHEMA IF EXISTS drizzle CASCADE;`;
await sql`CREATE SCHEMA public;`;
await sql`GRANT ALL ON SCHEMA public TO postgres;`;
await sql`GRANT ALL ON SCHEMA public TO public;`;
await sql`COMMENT ON SCHEMA public IS 'standard public schema';`;

// The storage schema is not dropped (Supabase owns it), so the policies that
// migration 0005 creates on storage.objects survive the reset and would make
// the re-run fail with "policy already exists". Drop them so 0005 re-applies.
await sql`DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;`;
await sql`DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;`;
await sql`DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;`;

if (wipeAuth) {
  // Disposable test projects only: clears GoTrue users left by E2E runs.
  // identities/sessions cascade; refresh tokens cascade via sessions.
  console.log('Wiping auth.users...');
  await sql`DELETE FROM auth.users;`;
}
await sql.end();

console.log('Running migrations...');
execSync('pnpm --filter @pm-operator/db db:migrate', {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

if (isRemoteArmed) {
  // On Supabase, dropping public orphans the default ACLs (they reference the
  // old schema OID); restore what PostgREST/service connections expect.
  console.log('Re-applying Supabase role grants...');
  const grants = postgres(url, { max: 1 });
  await grants`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`;
  await grants`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`;
  await grants`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`;
  await grants`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;`;
  await grants`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;`;
  await grants`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;`;
  await grants`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;`;
  await grants.end();
}

if (skipSeed) {
  console.log('Skipping seed (--no-seed).');
} else {
  console.log('Running seed...');
  execSync('pnpm --filter @pm-operator/db db:seed', {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });
}

console.log('Reset, migrate, and seed complete.');
