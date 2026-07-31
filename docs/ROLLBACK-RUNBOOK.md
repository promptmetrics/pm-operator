# Rollback Runbook

This runbook describes when and how to roll back a deployment of `operator.promptmetrics.dev`.

## Rollback criteria

Initiate a rollback immediately if any of the following is detected:

| Criterion | Threshold | Detection |
|-----------|-----------|-----------|
| Error rate | > 1% of requests for 5 minutes | Vercel Analytics / Sentry |
| P95 API latency | > 1.5 s on `/api/v1/*` for 5 minutes | Vercel Analytics |
| Content leak | Non-member can see invite-only/paid circle content | Moderation alert or automated probe |
| Broken signup | Sign-up success rate < 95% for 10 minutes | Sentry + Supabase auth logs |
| Point drift | `reputation_score` or `upvotes` counter diverges from source tables | DB consistency check |
| Broken OAuth / login | Any provider returning consistent failures | Sentry + login funnel |
| MCP route instability | `/api/mcp` error rate > 5% or P95 > 2 s | Sentry + `agent_actions.durationMs` |

If you are unsure whether a criterion is met, prefer rollback; the cutover can be re-attempted after root cause analysis.

## Rollback options (fastest first)

### 1. Disable the MCP feature flag (no deploy)

If the issue is isolated to MCP v2 alpha behavior:

1. Set `MCP_ENABLED=false` in the Vercel project environment variables.
2. Trigger a preview redeploy or wait for the env change to propagate (usually < 60 s).
3. Verify `/api/mcp` returns `503` or a disabled message.
4. Leave the rest of the site running.

### 2. Revert DNS to the legacy NodeBB VPS

If the new site is broadly failing:

1. Log in to the DNS provider for `operator.promptmetrics.dev`.
2. Change the A/AAAA or CNAME record to point back to the NodeBB VPS.
3. Lower TTL to 60 s if not already set.
4. Verify the old site loads within the TTL window.
5. Keep the Vercel deployment running in the background for debugging.

### 3. Pause Loops sends

If the issue involves incorrect transactional emails (e.g., wrong password-reset links, duplicate notifications):

1. Disable the Loops API key or pause the relevant queue.
2. Set `LOOPS_API_KEY=` blank in Vercel to stop new sends immediately.
3. Verify no new email events appear in Loops logs.

### 4. Roll back the Vercel production deployment

If a specific bad deploy is identified:

1. In the Vercel dashboard, find the last stable production deployment.
2. Click **Promote to Production**.
3. Verify the rollback deployment becomes active.
4. Monitor error rate and critical flows for 15 minutes.

### 5. Roll back a database migration

If a migration introduced schema/trigger bugs:

1. Stop all writes (enable maintenance page if necessary).
2. Identify the last known-good migration in `packages/db/migrations/`.
3. Apply the inverse migration or restore from a pre-deploy backup.
4. Run `pnpm turbo db:migrate` to confirm the target state.
5. Re-enable traffic only after smoke tests pass.

## Communication checklist

- Post in the incident channel with the rollback reason and current status.
- Update the status page if external visibility is affected.
- Notify the Community Lead if moderation/reputation data may have been impacted.
- Open a P0 ticket to investigate the root cause before re-cutting over.

## Post-rollback verification

After any rollback, run these checks:

1. Public feed loads anonymously.
2. Sign-up → onboarding → create post succeeds end-to-end.
3. Invite-only circle content is not visible to non-members.
4. `point_events` and counter consistency query returns zero drift.
5. Error rate is below 0.1% for 10 minutes.

## Decision tree

```
Is the issue MCP-only?
  Yes  → Disable MCP_ENABLED and monitor.
  No   → Is the site broadly broken?
           Yes  → Revert DNS, then investigate.
           No   → Is a specific deploy bad?
                    Yes  → Promote previous Vercel deploy.
                    No   → Is a migration at fault?
                             Yes  → Roll back DB.
                             No   → Pause Loops and escalate.
```
