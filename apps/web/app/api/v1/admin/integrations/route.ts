export const runtime = 'nodejs';

import {
  getDb,
  ok,
  requireSession,
  forbidden,
} from '@/lib/api/server';
import {
  requireGlobalAdmin,
  adminListMcpClients,
  adminRevokeMcpClient,
  adminCreateAuditLog,
} from '@/lib/services/admin';

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);
    const clients = await adminListMcpClients(getDb());
    return ok({ clients });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    throw err;
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  try {
    await requireGlobalAdmin(getDb(), session.userId);

    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId');
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId is required' }), { status: 400 });
    }

    await adminRevokeMcpClient(getDb(), clientId);

    await adminCreateAuditLog(getDb(), {
      actorId: session.userId,
      action: "mcp_client_revoke",
      targetType: 'mcp_client',
      targetId: clientId,
      details: { clientId },
    });

    return ok({ revoked: true });
  } catch (err: any) {
    if (err.message === 'Forbidden') return forbidden('Global admin access required');
    if (err.message === 'MCP client not found') {
      return new Response(JSON.stringify({ error: 'MCP client not found' }), { status: 404 });
    }
    throw err;
  }
}
