import 'server-only';

import { createDrizzleClient, type DrizzleClient } from '@pm-operator/db';

export type { DrizzleClient };

let serviceDbInstance: DrizzleClient | undefined;
let missingUrlProxy: DrizzleClient | undefined;

export function createServiceDb(): DrizzleClient {
  const databaseUrl = process.env.DATABASE_URL;
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
    const { db } = createDrizzleClient({ databaseUrl });
    serviceDbInstance = db;
  }
  return serviceDbInstance;
}
