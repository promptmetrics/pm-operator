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

const sql = postgres(url, { max: 1 });

console.log('Dropping public and drizzle schemas...');
await sql`DROP SCHEMA IF EXISTS public CASCADE;`;
await sql`DROP SCHEMA IF EXISTS drizzle CASCADE;`;
await sql`CREATE SCHEMA public;`;
await sql`GRANT ALL ON SCHEMA public TO postgres;`;
await sql`GRANT ALL ON SCHEMA public TO public;`;
await sql`COMMENT ON SCHEMA public IS 'standard public schema';`;
await sql.end();

console.log('Running migrations...');
execSync('pnpm --filter @pm-operator/db db:migrate', {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

console.log('Running seed...');
execSync('pnpm --filter @pm-operator/db db:seed', {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

console.log('Reset, migrate, and seed complete.');
