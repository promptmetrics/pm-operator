import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.resolve(workspaceRoot, '.env') });
dotenv.config({ path: path.resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: path.resolve(workspaceRoot, 'apps/web/.env.local') });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 1 });

async function run(file) {
  const content = await readFile(path.resolve(__dirname, 'migrations', file), 'utf8');
  console.log(`Applying ${file}...`);
  await sql.unsafe(content);
}

await run('0001_numerous_killer_shrike.sql');
await run('0002_slimy_pandemic.sql');
await run('0005_square_the_phantom.sql');
await run('0006_groovy_edwin_jarvis.sql');

console.log('Missing fixes applied.');
await sql.end();
