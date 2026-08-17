# MCP server setup for pm-operator

The pm-operator community MCP server lives in `packages/mcp` and is mounted at
`/api/mcp` (`apps/web/app/api/mcp/route.ts`). It speaks the [2026-07-28 MCP
spec](https://modelcontextprotocol.io/specification/2026-07-28) (stateless, POST-only, no
`initialize` handshake) and is gated by HS256 bearer-token auth.

This guide gets it running locally or on Vercel and added to Claude Code so you can use the
community tools from a Claude Code session — reading, posting, commenting, reacting, and (with
an admin-bound token) full community administration, all via natural language.

## How auth works (read this once)

- A client is a row in the `mcp_clients` table (`client_id`, `name`, `scopes`, `is_active`).
- A bearer token is an HS256 JWT signed with `MCP_TOKEN_SECRET`. The server
  (`packages/mcp/src/auth.ts`) verifies the signature, checks `iss` / `aud` / `exp`, looks up the
  token's `client_id` in `mcp_clients`, intersects the token's scopes with the client row's
  registered `scopes` (dropping anything ungranted), and requires `community:read`.
- **Scopes** (advertised in the RFC 9728 resource metadata):
  | Scope | Tools it unlocks | Gate |
  |-------|------------------|------|
  | `community:read` (baseline, always required) | 4 read tools + 4 resources | Route gate |
  | `community:write` | 13 engagement tools (post, comment, react, bookmark, follow, join/leave) | Per-tool `requireScope` + a bound user |
  | `community:admin` | 21 operations tools (users, groups, moderation, settings, badges, points, audit, MCP clients) | Per-tool `requireScope` + `requireGlobalAdmin` |
- **User-bound tokens.** Write/admin tools act *as a real user* — the audit actor and the subject
  of every service permission check. The JWT carries a `user_id` claim (set via `--user-slug`),
  which `verifyMcpOAuthToken` plumbs through to `McpContext.userId`. A token without `user_id` can
  still use read tools, but every write/admin tool returns an error ("write tools require a
  user-bound token"). When `community:admin` is requested, the bound user's `role` must be `admin`
  (the minting script enforces this; the server re-checks via `requireGlobalAdmin`).
- **There is no token-issuance endpoint.** `scripts/manage-mcp-clients.mjs` is the launch-time
  issuer — it registers clients (`add`) and mints tokens (`token`), reading
  `DATABASE_URL` and `MCP_TOKEN_SECRET` from your gitignored `.env.local` (never the command line).

Required env vars (see `docs/ENV-CHECKLIST.md`):

| Variable | Where | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Server | Postgres connection (already set for dev). |
| `MCP_TOKEN_SECRET` | Server | HS256 signing secret for tokens. Generate once. |
| `MCP_ENABLED` | Server | Feature flag; the `/api/mcp` route 404s unless `true`. |
| `NEXT_PUBLIC_SITE_URL` | Public | Used to build the RFC 9728 metadata URL. Local: `http://localhost:3000`; prod: `https://operator.promptmetrics.dev`. |

> `MCP_TOKEN_SECRET` must be **identical** between where you mint the token (your local
> `.env.local`) and where the server verifies it (Vercel env). A mismatch → every token 401s.

## End-user install (OAuth — recommended)

The server runs a real **OAuth 2.1 Authorization Server** (RFC 9728 protected-resource
metadata + RFC 8414 authorization-server metadata + RFC 7591 dynamic client registration +
RFC 7009 revocation), so an end user never pastes a token. They run one command and sign in
with their browser:

```bash
claude mcp add --transport http -s user pm-operator https://operator.promptmetrics.dev/api/mcp
```

`--transport http` is the Streamable HTTP transport type (this is what triggers OAuth
discovery); the URL's `https` scheme is a separate positional. `-s user` keeps the server
config out of the repo. `pm-operator` is the required server name.

What happens under the hood: Claude Code fetches `/.well-known/oauth-protected-resource/api/mcp`,
follows `authorization_servers` to `/.well-known/oauth-authorization-server`, dynamically
registers a client at `/api/oauth/register`, opens a browser to `/oauth/authorize`, the user
signs in with Google (Supabase Auth), reviews a **consent screen** (client name + requested
scopes), and is redirected back to a loopback callback. Claude Code exchanges the
authorization code at `/api/oauth/token` (PKCE, `S256`) and stores the resulting bearer token.

**Token model.** Access tokens are the same HS256 JWTs the verifier already accepts — 1h TTL,
carrying `sub` (client_id), `scope`, and `user_id` (the signed-in user). A **30-day rotatable
refresh token** is issued alongside; Claude Code refreshes silently, so Google re-auth is at
most monthly. Refresh-token **rotation + reuse detection** is on: presenting a used refresh
token revokes that user's whole chain for the client (OAuth 2.1 automatic-rotation).

**Scopes.** The client requests `community:read community:write` by default; granted scopes are
the intersection of requested ∩ the client's registered scopes, with `community:read` always
forced and `community:admin` dropped unless the signed-in user's `role === 'admin'` (re-checked
at both authorize and token time). So a non-admin who requests `community:admin` simply gets a
token without it — no error, the admin tools just refuse with `InsufficientScope`.

**Server requirements.** The AS is gated by the same `MCP_ENABLED` flag as `/api/mcp` and uses
`NEXT_PUBLIC_SITE_URL` for its metadata `issuer` (distinct from the JWT `iss` claim, which stays
the bare host `operator.promptmetrics.dev`). Both are already required for the MCP route — no new
env vars or secrets.

The OAuth flow also works for local dev if you've configured Supabase Google OAuth to accept
`http://localhost:3000` and set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. If you haven't, use
the manual bootstrap flow below instead.

## A. Local development (manual bootstrap)

> The manual `manage-mcp-clients.mjs token` flow is the **admin / bootstrap** path — for local
> dev without browser OAuth, or minting a long-lived service token by hand. End users should use
> the [OAuth flow above](#end-user-install-oauth--recommended) instead.

1. **Generate a signing secret** (one-time):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

2. **Add to `apps/web/.env.local`** (gitignored):
   ```bash
   MCP_TOKEN_SECRET=<hex from step 1>
   MCP_ENABLED=true
   ```
   Ensure `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. `DATABASE_URL` is already there for dev.

3. **Register a client** (writes to your dev DB). List the scopes you want it to be able to hold:
   ```bash
   node scripts/manage-mcp-clients.mjs add --client-id local-dev --name "Local dev" \
     --scopes community:read,community:write,community:admin
   ```

4. **Mint a bearer token** (defaults to 30 days; `--expires-in 365d` for a year). Bind it to your
   admin user so write/admin tools act as you:
   ```bash
   node scripts/manage-mcp-clients.mjs token --client-id local-dev \
     --scopes community:read,community:write,community:admin --user-slug izzy-a --expires-in 365d
   ```
   The bare JWT prints to **stdout**; metadata (scopes, bound user, expiry) to stderr. Copy the
   token. For a read-only token, omit `--scopes` and `--user-slug` (defaults to `community:read`).

5. **Start the server**:
   ```bash
   pnpm dev
   ```
   → `http://localhost:3000` (the MCP endpoint is `http://localhost:3000/api/mcp`).

6. **Add to Claude Code** — use `-s user` (or `-s local`) so the token is **not** committed:
   ```bash
   claude mcp add --transport http -s user pm-operator http://localhost:3000/api/mcp \
     --header "Authorization: Bearer <token>"
   ```

7. **Verify**: `claude mcp list` should show `pm-operator`. Then in a `claude` session, ask it to
   use a tool, e.g. *"search community posts for 'mcp' via the pm-operator MCP."*

### Quick smoke test without Claude Code

```bash
TOKEN=$(node scripts/manage-mcp-clients.mjs token --client-id local-dev --expires-in 1d)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'mcp-protocol-version: 2026-07-28' \
  -H 'mcp-method: tools/list' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' \
  http://localhost:3000/api/mcp
# expect: 200
```
Without the `Authorization` header you should get `401` with a `WWW-Authenticate` challenge.

## B. Vercel production (manual bootstrap)

> Same as above — this is the admin/bootstrap path for minting a long-lived prod token by hand.
> End users install via the [OAuth flow](#end-user-install-oauth--recommended); no manual token
> needed.

1. **Generate a signing secret** (same command as local). Keep it — you'll mint tokens with it
   locally, so it must match what you put in Vercel.

2. **Set env vars in Vercel and redeploy**:
   ```bash
   vercel env add MCP_TOKEN_SECRET     # paste the hex, choose Production
   vercel env add MCP_ENABLED          # value: true, choose Production
   vercel --prod                        # redeploy so the new env vars take effect
   ```
   (`NEXT_PUBLIC_SITE_URL=https://operator.promptmetrics.dev` should already be set in prod.)

3. **Register a client in the prod DB**. Point your local `.env.local` at the **prod**
   `DATABASE_URL`, run the script, then restore your local `DATABASE_URL`:
   ```bash
   # (temporarily set DATABASE_URL to prod in apps/web/.env.local)
   node scripts/manage-mcp-clients.mjs add --client-id prod-claude --name "Claude Code (prod)"
   # (restore your local DATABASE_URL)
   ```
   Or, for a one-off with zero local secret exposure, run the INSERT in the Supabase SQL Editor
   (the `postgres` service role bypasses RLS):
   ```sql
   INSERT INTO mcp_clients (client_id, name, scopes, is_active)
   VALUES ('prod-claude', 'Claude Code (prod)', '{community:read,community:write,community:admin}', true);
   ```

4. **Mint a token with the same secret** you put in Vercel (keep your local `.env.local` pointed at
   the prod DB for the verify step, or pass `--no-verify`). Bind it to your admin user:
   ```bash
   node scripts/manage-mcp-clients.mjs token --client-id prod-claude \
     --scopes community:read,community:write,community:admin --user-slug izzy-a --expires-in 365d
   ```

5. **Add to Claude Code**:
   ```bash
   claude mcp add --transport http -s user pm-operator https://operator.promptmetrics.dev/api/mcp \
     --header "Authorization: Bearer <token>"
   ```

6. **Verify**: `claude mcp list`, then use it in a `claude` session.

## Managing clients

```bash
node scripts/manage-mcp-clients.mjs list                                   # all clients, newest first
node scripts/manage-mcp-clients.mjs add --client-id X --name "..." --scopes community:read,community:write,community:admin
node scripts/manage-mcp-clients.mjs add --client-id X --name "..." --inactive   # add disabled
node scripts/manage-mcp-clients.mjs revoke --client-id X                    # soft-delete (is_active=false)
node scripts/manage-mcp-clients.mjs add --client-id X --name "..." --active   # re-enable
# read-only token:
node scripts/manage-mcp-clients.mjs token --client-id X --expires-in 365d
# full-power admin token (bound to a real admin user — the audit actor):
node scripts/manage-mcp-clients.mjs token --client-id X --scopes community:read,community:write,community:admin --user-slug izzy-a --expires-in 30d
```

`add` is an idempotent upsert on `client_id` — re-running updates name/scopes/active instead of
erroring. `revoke` mirrors `adminRevokeMcpClient` (soft-delete).

The `token` command validates, up front:
- every requested scope is known and `community:read` is included (the route gate requires it);
- the requested scopes ⊆ the client row's registered scopes (else it errors and tells you to
  widen the client with `add --scopes ...` first — because the server would silently drop
  ungranted scopes anyway);
- when `community:write` or `community:admin` is requested, `--user-slug` is supplied and resolves
  to a real user (`SELECT id, role FROM users WHERE lower(userslug) = lower($1)`), setting the
  `user_id` claim;
- when `community:admin` is requested, that user's `role` is `admin`.

`--no-verify` skips the client-row and scope-subset checks (use when minting against a different
DB than the server checks). User-resolution and admin-role checks still run.

## Security notes

- **Scope**: use `-s user` or `-s local` for `claude mcp add`. **Never** `-s project` for a real
  token — project scope writes `.mcp.json` into the repo and would commit the bearer token.
- **Treat the token as a credential.** A `community:read` token exposes community data; a
  `community:write` token can post/comment/react *as the bound user*; a `community:admin` token
  bound to an admin is **full admin power** — delete users, change roles, revoke MCP clients, edit
  settings. If any token leaks, revoke the client (`revoke --client-id ...`) — revocation is by
  client, so **all** tokens for that `client_id` stop working immediately; then register a new
  `client_id` and mint fresh. Prefer short expiries (`--expires-in 30d`) for admin tokens.
- **The scope system is the kill-switch.** Because the server intersects token scopes with the
  client row's registered scopes, you can narrow a client's power at any time with
  `add --scopes community:read` (then mint a new token) without touching `MCP_TOKEN_SECRET`.
- **Every write/admin call is audited.** `agent_actions` logs every MCP tool call (100% of
  writes/admins, 10% sampled for reads); admin mutations additionally write `audit_logs` with
  `actorId` = the bound user's id. So MCP-authored actions are traceable to a real person.
- **The `token` command never puts the secret on the command line** — it loads
  `MCP_TOKEN_SECRET` from `.env.local` via `dotenv`, same secure pattern as
  `packages/db/src/migrate.ts`. (The older `scripts/manage-circles.mjs` takes `DATABASE_URL` as an
  inline arg, which leaks into shell history / `ps` — this script does not.)
- **`iss` / `aud` are `operator.promptmetrics.dev` even for local tokens.** That's by design —
  the verifier (`auth.ts`) checks fixed constants, not the request host. It's not a
  misconfiguration.
- **Requires a recent Claude Code** with Streamable HTTP (`--transport http`) support for the
  2026-07-28 stateless transport. `claude mcp list` will show a connection error if your version is
  too old; upgrade Claude Code in that case.

## Out of scope / fast-follow

- **Access-token denylist.** Access tokens are stateless HS256 JWTs (1h TTL), so revoking one is
  a no-op that relies on the TTL. The `jti` claim is already emitted; a denylist table + revoke
  check is the follow-up. Refresh tokens *are* stateful and fully revocable today (RFC 7009).
- **Confidential clients.** Dynamic client registration accepts `token_endpoint_auth_method='none'`
  (public PKCE clients) only. `client_secret_basic` / JWT client auth is a follow-up.
- **A `--rotate` for `MCP_TOKEN_SECRET`** — rotating the secret invalidates every outstanding
  token; mint new tokens for each client afterward.

## Tool catalog

38 tools total (4 read + 13 write + 21 admin), registered in `packages/mcp/src/tools.ts`. Read
tools return structured output; write/admin tools return JSON as text.

**`community:read`** (baseline, no bound user required): `search_posts`, `get_user_profile`,
`list_leaderboards`, `summarize_thread` — plus 4 resources (post, user profile, leaderboard,
thread summary).

**`community:write`** (requires a bound user — the author/actor):
`create_post`, `update_post`, `delete_post`, `create_comment`, `update_comment`,
`delete_comment`, `accept_solution`, `toggle_reaction`, `toggle_bookmark`, `follow_user`,
`unfollow_user`, `join_circle`, `leave_circle`.

**`community:admin`** (requires a bound admin + `requireGlobalAdmin`; mutations audited):
`admin_list_users`, `admin_get_user`, `admin_set_user_role`, `admin_delete_user`,
`admin_list_groups`, `admin_create_group`, `admin_update_group`, `admin_delete_group`,
`admin_update_settings`, `admin_award_points`, `admin_list_badges`, `admin_create_badge`,
`admin_award_badge`, `admin_list_watched_phrases`, `admin_create_watched_phrase`,
`admin_delete_watched_phrase`, `admin_resolve_flag`, `admin_delete_flag`,
`admin_list_audit_logs`, `admin_list_mcp_clients`, `admin_revoke_mcp_client`.

Each write/admin tool is a thin wrapper over the existing backend service in
`apps/web/lib/services/` — it validates input, checks scope + user-binding, calls the service
with the bound user's id (so the service's own authorship/admin checks and point/streak side
effects run unchanged), rate-limits (`mcpWrite` 30/min, `mcpAdmin` 20/min per client), logs to
`agent_actions`, and (for admin mutations) writes `audit_logs`.