/**
 * Manage mcp_clients rows (the registrations the MCP OAuth verifier looks up).
 *
 * Secure env loading: DATABASE_URL is read from process.env after dotenv loads
 * .env / .env.local / apps/web/.env.local (all gitignored). It is NEVER passed
 * on the command line, so it does not leak into shell history or `ps`. This
 * matches the pattern in packages/db/src/migrate.ts — not manage-circles.mjs,
 * which takes DATABASE_URL as an inline arg (leaky).
 *
 * Usage:
 *   node scripts/manage-mcp-clients.mjs <subcommand> [options]
 *
 * Subcommands:
 *   add     --client-id <id> --name <name> [--scopes community:read,...] [--active|--inactive]
 *   list
 *   revoke  --client-id <id>
 *   token   --client-id <id> [--scopes community:read[,community:write[,community:admin]]]
 *           [--user-slug <slug>] [--expires-in 30d] [--no-verify]
 *           Mints an HS256 bearer JWT signed with MCP_TOKEN_SECRET (loaded from
 *           .env.local, never the command line). The token's client_id must be
 *           registered and active unless --no-verify is passed. --user-slug
 *           binds the token to a real user (the audit actor for write/admin
 *           tools) via the user_id claim; required for write/admin scopes, and
 *           the bound user must be a global admin when community:admin is set.
 *
 * DATABASE_URL is picked up from apps/web/.env.local (or .env.local / .env),
 * never from the command line.
 */

import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');

// pnpm's strict layout symlinks postgres/dotenv into packages/db/node_modules
// (a package that declares them), not into the workspace root. Anchoring
// createRequire at packages/db/package.json makes both resolvable from this
// script without adding deps anywhere. (Anchoring at import.meta.url — i.e.
// scripts/ — would fail with MODULE_NOT_FOUND under pnpm's default layout.)
const require = createRequire(path.resolve(workspaceRoot, 'packages/db/package.json'));
const postgres = require('postgres');
const dotenv = require('dotenv');

// Load env files from the workspace root and from the web app. Later files
// win, matching packages/db/src/migrate.ts. All three are gitignored.
dotenv.config({ path: path.resolve(workspaceRoot, '.env') });
dotenv.config({ path: path.resolve(workspaceRoot, '.env.local') });
dotenv.config({ path: path.resolve(workspaceRoot, 'apps/web/.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL is not set.');
  console.error('Put it in one of (gitignored):');
  console.error('  apps/web/.env.local');
  console.error('  .env.local');
  console.error('  .env');
  console.error('Then re-run. Do NOT pass it on the command line.');
  process.exit(1);
}

// Must match the scopes advertised in the RFC 9728 resource metadata
// (apps/web/app/.well-known/oauth-protected-resource/api/mcp/route.ts) and
// enforced per-tool in packages/mcp/src/tools.ts. community:read is the
// baseline every token carries (the route gate hard-requires it).
const KNOWN_SCOPES = ['community:read', 'community:write', 'community:admin'];

// Must match packages/mcp/src/auth.ts TOKEN_ISSUER / TOKEN_AUDIENCE. The
// verifier checks these exact constants regardless of where the server runs,
// so local tokens carry the prod-domain claims too — that's intentional.
const TOKEN_ISSUER = 'operator.promptmetrics.dev';
const TOKEN_AUDIENCE = 'operator.promptmetrics.dev/mcp';

function usage() {
  console.error(`Usage: node scripts/manage-mcp-clients.mjs <subcommand> [options]

Subcommands:
  add     --client-id <id> --name <name> [--scopes community:read,...] [--active|--inactive]
          Idempotent: inserts or updates the client (keyed on client_id).
  list    List all MCP clients (newest first).
  revoke  --client-id <id>
          Soft-delete: sets is_active=false (mirrors adminRevokeMcpClient).
  token   --client-id <id> [--scopes community:read[,community:write[,community:admin]]]
          [--user-slug <slug>] [--expires-in 30d] [--no-verify]
          Mints an HS256 bearer JWT signed with MCP_TOKEN_SECRET (loaded from
          apps/web/.env.local — never the command line). Prints the bare token
          to stdout (metadata to stderr), so \`TOKEN=$(node ... token ...)\` works.
          --scopes: comma list, space-joined in the JWT scope claim. Defaults to
            community:read; community:read is always required (route gate).
          --user-slug: bind the token to a real user (sets the user_id claim so
            write/admin tools act as that user, the audit actor). Required for
            write/admin scopes; the bound user must be role=admin for
            community:admin. Verified against the client's registered scopes.

DATABASE_URL and MCP_TOKEN_SECRET are read from apps/web/.env.local / .env.local
/ .env (gitignored), never from the command line. Examples:
  node scripts/manage-mcp-clients.mjs add --client-id my-client --name "My client" --scopes community:read,community:write,community:admin
  node scripts/manage-mcp-clients.mjs list
  node scripts/manage-mcp-clients.mjs token --client-id my-client --scopes community:read,community:write,community:admin --user-slug izzy-a --expires-in 30d
  node scripts/manage-mcp-clients.mjs token --client-id my-client --expires-in 365d
  node scripts/manage-mcp-clients.mjs revoke --client-id my-client`);
}

// Minimal --flag value parser. Returns a map of flag -> value (or true for
// boolean flags). Unknown flags are ignored.
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--active') flags.active = true;
    else if (a === '--inactive') flags.active = false;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    }
  }
  return flags;
}

function required(flags, name) {
  const v = flags[name];
  if (!v || v === true) {
    console.error(`Error: --${name.replace(/_/g, '-')} is required`);
    usage();
    process.exit(1);
  }
  return String(v);
}

function printRow(r) {
  const status = r.is_active ? 'active' : 'revoked';
  console.log(`  ${r.client_id}  ${r.name}  [${r.scopes.join(', ')}]  ${status}  ${r.created_at.toISOString()}`);
}

// Parse "30d" / "12h" / "60m" / "3600" (bare = seconds) into seconds.
function parseDuration(s) {
  const m = /^(\d+)\s*(d|h|m|s)?$/i.exec(String(s).trim());
  if (!m) {
    console.error(`Error: invalid --expires-in "${s}" (use e.g. 30d, 12h, 60m, or seconds)`);
    process.exit(1);
  }
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  const mult = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return n * mult;
}

async function main() {
  const sub = process.argv[2];
  if (!sub || sub === '--help' || sub === '-h') {
    usage();
    process.exit(sub ? 0 : 1);
  }

  const sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });

  try {
    if (sub === 'add') {
      const flags = parseFlags(process.argv.slice(3));
      const clientId = required(flags, 'client-id');
      const name = required(flags, 'name');
      const scopesRaw = flags.scopes && flags.scopes !== true ? String(flags.scopes) : 'community:read';
      const scopes = scopesRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (scopes.length === 0) {
        console.error('Error: --scopes must list at least one scope');
        process.exit(1);
      }
      const unknown = scopes.filter((s) => !KNOWN_SCOPES.includes(s));
      if (unknown.length > 0) {
        console.error(`Warning: unknown scope(s): ${unknown.join(', ')} (known: ${KNOWN_SCOPES.join(', ')})`);
      }
      const isActive = flags.active === false ? false : true; // default true

      const [row] = await sql`
        INSERT INTO mcp_clients (client_id, name, scopes, is_active)
        VALUES (${clientId}, ${name}, ${scopes}, ${isActive})
        ON CONFLICT (client_id) DO UPDATE
          SET name = EXCLUDED.name,
              scopes = EXCLUDED.scopes,
              is_active = EXCLUDED.is_active
        RETURNING id, client_id, name, scopes, is_active, created_at
      `;
      console.log(`✓ Saved MCP client:`);
      printRow(row);
    } else if (sub === 'list') {
      const rows = await sql`
        SELECT id, client_id, name, scopes, is_active, created_at
        FROM mcp_clients
        ORDER BY created_at DESC
      `;
      if (rows.length === 0) {
        console.log('No MCP clients found.');
        return;
      }
      console.log(`MCP clients (${rows.length}):`);
      for (const r of rows) printRow(r);
    } else if (sub === 'revoke') {
      const flags = parseFlags(process.argv.slice(3));
      const clientId = required(flags, 'client-id');
      const [row] = await sql`
        UPDATE mcp_clients SET is_active = false
        WHERE client_id = ${clientId}
        RETURNING client_id
      `;
      if (!row) {
        console.error(`Error: MCP client not found: ${clientId}`);
        process.exit(1);
      }
      console.log(`✓ Revoked MCP client: ${row.client_id}`);
    } else if (sub === 'token') {
      const flags = parseFlags(process.argv.slice(3));
      const clientId = required(flags, 'client-id');
      const secret = process.env.MCP_TOKEN_SECRET;
      if (!secret) {
        console.error('Error: MCP_TOKEN_SECRET is not set.');
        console.error('Put it in apps/web/.env.local / .env.local / .env (gitignored).');
        console.error('It must match the secret the server verifies with.');
        process.exit(1);
      }

      // Scope claim. Comma-separated on the CLI; the JWT carries them
      // space-joined because parseScopes (packages/mcp/src/auth.ts) splits the
      // scope claim on /\s+/. community:read is always required (route gate).
      const scopesRaw = flags.scopes && flags.scopes !== true ? String(flags.scopes) : 'community:read';
      const scopes = scopesRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (scopes.length === 0) {
        console.error('Error: --scopes must list at least one scope');
        process.exit(1);
      }
      const unknown = scopes.filter((s) => !KNOWN_SCOPES.includes(s));
      if (unknown.length > 0) {
        console.error(`Error: unknown scope(s): ${unknown.join(', ')} (known: ${KNOWN_SCOPES.join(', ')})`);
        process.exit(1);
      }
      if (!scopes.includes('community:read')) {
        console.error('Error: every token must include community:read (the route gate requires it)');
        process.exit(1);
      }

      // Resolve the bound user (user_id claim). Write/admin tools act as this
      // user — they're the audit actor and the subject of permission checks.
      // When community:admin is requested the bound user must be a global admin,
      // mirroring requireGlobalAdmin in the tool layer (apps/web/lib/services/mcp.ts).
      const userSlug = flags['user-slug'] && flags['user-slug'] !== true ? String(flags['user-slug']) : null;
      let userId = null;
      let userRole = null;
      if (userSlug) {
        const [user] = await sql`
          SELECT id, role FROM users WHERE lower(userslug) = lower(${userSlug})
        `;
        if (!user) {
          console.error(`Error: no user with userslug "${userSlug}" (matched case-insensitively)`);
          process.exit(1);
        }
        userId = user.id;
        userRole = user.role;
      }
      const wantsAdmin = scopes.includes('community:admin');
      const wantsWrite = scopes.includes('community:write');
      if ((wantsWrite || wantsAdmin) && !userId) {
        console.error('Error: --user-slug is required for write/admin scopes');
        console.error('(write/admin actions act as that user — the audit actor)');
        process.exit(1);
      }
      if (wantsAdmin && userRole !== 'admin') {
        console.error(`Error: user "${userSlug}" has role "${userRole}", not "admin"`);
        console.error('community:admin requires a global-admin-bound token.');
        process.exit(1);
      }

      const ttl = parseDuration(flags['expires-in'] && flags['expires-in'] !== true ? String(flags['expires-in']) : '30d');
      const now = Math.floor(Date.now() / 1000);
      const exp = now + ttl;

      // By default refuse to mint for an unknown/inactive client, mirroring the
      // server's lookupClient check (packages/mcp/src/auth.ts). --no-verify skips
      // this when this script's DB isn't the one the server will check against.
      if (flags['no-verify'] !== true) {
        const [client] = await sql`SELECT is_active, scopes FROM mcp_clients WHERE client_id = ${clientId}`;
        if (!client) {
          console.error(`Error: MCP client not found: ${clientId}`);
          console.error('Register it first with `add`, or pass --no-verify.');
          process.exit(1);
        }
        if (!client.is_active) {
          console.error(`Error: MCP client is revoked (inactive): ${clientId}`);
          console.error('Re-enable with `add --client-id ... --active`, or pass --no-verify.');
          process.exit(1);
        }
        // The verifier intersects token scopes with the client row's scopes and
        // drops anything ungranted, so a token claiming more than the client is
        // registered for would silently lose those scopes at use time. Catch it
        // here instead — tell the operator to widen the client registration first.
        const clientScopes = client.scopes || [];
        const ungranted = scopes.filter((s) => !clientScopes.includes(s));
        if (ungranted.length > 0) {
          console.error(`Error: client "${clientId}" is not registered for: ${ungranted.join(', ')}`);
          console.error(`Registered scopes: ${clientScopes.join(', ')}`);
          console.error(`Widen it first:  add --client-id ${clientId} --name "..." --scopes ${scopes.join(',')}`);
          process.exit(1);
        }
      }

      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        iss: TOKEN_ISSUER,
        aud: TOKEN_AUDIENCE,
        sub: clientId,
        scope: scopes.join(' '),
        iat: now,
        exp,
      };
      if (userId) payload.user_id = userId;
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const data = `${b64(header)}.${b64(payload)}`;
      const sig = createHmac('sha256', secret).update(data).digest('base64url');
      const token = `${data}.${sig}`;

      // Bare token on stdout (scriptable); metadata on stderr keeps stdout clean.
      const bound = userId ? `, bound user=${userSlug} (${userRole})` : '';
      console.error(`✓ Minted token for ${clientId} (scopes: ${scopes.join(', ')}${bound}, expires ${new Date(exp * 1000).toISOString()})`);
      console.log(token);
    } else {
      console.error(`Error: unknown subcommand "${sub}"`);
      usage();
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();