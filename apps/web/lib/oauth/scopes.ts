import { REQUIRED_READ_SCOPE, REQUIRED_ADMIN_SCOPE } from '@pm-operator/mcp';
import { KNOWN_SCOPES } from './constants';

// Granted scopes = requested ∩ client.registered_scopes, with community:read
// always present and community:admin dropped unless the bound user is an admin
// at decision time. Used at authorize, approve, AND token (re-checked at token
// so a role change in the 120s code window still narrows correctly).

export function narrowGrantedScopes(
  requested: string[],
  clientScopes: string[],
  isAdmin: boolean,
): string[] {
  const allowed = new Set(clientScopes.filter((s) => (KNOWN_SCOPES as readonly string[]).includes(s)));
  const result = new Set(requested.filter((s) => allowed.has(s)));
  result.add(REQUIRED_READ_SCOPE);
  if (!isAdmin) result.delete(REQUIRED_ADMIN_SCOPE);
  return Array.from(result);
}

export function parseScope(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).filter(Boolean);
}

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'community:read': 'Read community posts, profiles, and leaderboards',
  'community:write': 'Create posts and comments, react, follow, and join circles',
  'community:admin': 'Admin: manage users, groups, badges, and moderation',
};