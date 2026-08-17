import { eq } from 'drizzle-orm';
import * as schema from '@pm-operator/db';
import type { DrizzleClient } from '@pm-operator/db';

// Full-row client lookup for the Authorization Server (DCR/authorize/token/
// revoke need redirect_uris, grant_types, client_secret, etc.). The verify-path
// lookupClient in app/api/mcp/route.ts is intentionally left as a narrow
// 3-column select — it only needs clientId/scopes/isActive and stays unchanged.

export type McpClientRow = typeof schema.mcpClients.$inferSelect;

export async function lookupClientByClientId(
  db: DrizzleClient,
  clientId: string,
): Promise<McpClientRow | null> {
  const rows = await db
    .select()
    .from(schema.mcpClients)
    .where(eq(schema.mcpClients.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}