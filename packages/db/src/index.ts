import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * as schema from './schema';
export * from './schema';

export type DrizzleClient = PostgresJsDatabase<typeof schema>;

export function createDrizzleClient(env: { databaseUrl: string }): {
  db: DrizzleClient;
  sql: ReturnType<typeof postgres>;
} {
  const client = postgres(env.databaseUrl, {
    prepare: false,
    // Supabase's session-mode pooler caps total clients at pool_size (15).
    // Serverless instances each hold `max` connections, so keep it small and
    // release idle ones — warm instances holding connections indefinitely
    // exhausts the pool (EMAXCONNSESSION).
    max: Number(process.env.DB_POOL_SIZE ?? 3),
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  return { db, sql: client };
}
