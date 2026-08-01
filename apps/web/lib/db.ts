import 'server-only';

import { createDrizzleClient, type DrizzleClient } from '@pm-operator/db';

export type { DrizzleClient };

let serviceDbInstance: DrizzleClient | undefined;
let missingUrlProxy: DrizzleClient | undefined;

export function createServiceDb(): DrizzleClient {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    // During build steps without env vars, return a typed stub that throws
    // only when an actual DB operation is attempted.
    if (!missingUrlProxy) {
      missingUrlProxy = new Proxy({} as DrizzleClient, {
        get(_target, prop) {
          throw new Error(
            `Missing DATABASE_URL environment variable (tried to access DB.${String(prop)})`
          );
        },
      });
    }
    return missingUrlProxy;
  }
  if (!serviceDbInstance) {
    try {
      const { db } = createDrizzleClient({ databaseUrl });
      serviceDbInstance = db;
    } catch (err) {
      // Malformed DATABASE_URL (e.g. extra whitespace) should not crash module
      // initialization during build. Operations will throw a clearer message.
      if (!missingUrlProxy) {
        missingUrlProxy = new Proxy({} as DrizzleClient, {
          get(_target, prop) {
            throw new Error(
              `Invalid DATABASE_URL environment variable: ${err instanceof Error ? err.message : String(err)} (tried to access DB.${String(prop)})`
            );
          },
        });
      }
      return missingUrlProxy;
    }
  }
  return serviceDbInstance;
}
