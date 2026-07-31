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
    max: Number(process.env.DB_POOL_SIZE ?? 5),
  });
  const db = drizzle(client, { schema });
  return { db, sql: client };
}
