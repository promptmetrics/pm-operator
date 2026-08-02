import { z } from 'zod';
import { pageQuerySchema } from './common';

// T8.12 (ADMIN-5): admin-only audit list of MCP agent actions logged in
// `agent_actions` (written by lib/services/mcp.ts). List UI only — no
// create/update/delete. Filters by clientId (the MCP client identifier) and
// toolName, paginated.
export const agentActionListQuerySchema = pageQuerySchema.extend({
  clientId: z.string().optional(),
  toolName: z.string().optional(),
});

export type AgentActionListQuery = z.infer<typeof agentActionListQuerySchema>;

// One row in the audit list. input/output are returned as truncated string
// previews (the audit view is for triage, not full replay); createdAt is ISO.
export interface AgentActionListItem {
  id: string;
  clientId: string;
  userId: string | null;
  username: string | null;
  toolName: string;
  error: string | null;
  durationMs: number | null;
  inputPreview: string;
  outputPreview: string;
  createdAt: string;
}