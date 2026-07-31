# Moderator Runbook

This runbook describes the day-to-day moderation workflow for `operator.promptmetrics.dev`.

## Roles

| Role | Global permissions | Circle-level permissions |
|------|-------------------|--------------------------|
| `admin` | Full access, including users, tiers, watched phrases, badges | N/A (global bypass) |
| `moderator` | View and resolve flags, manage watched phrases | Can hide content in any circle when resolving a flag |
| `group admin` | None by default | Can create invites, remove members, hide content in that circle |
| `group moderator` | None by default | Can hide content and resolve flags in that circle |

## Flag lifecycle

### 1. Flag creation

A flag can be created by:

- An authenticated user clicking **Flag** on a post or comment and providing a reason.
- The watched-phrase scanner (`auto_flagged = true`) when new content matches a watched phrase.

The flag is stored in `flags` with `status = 'open'`.

### 2. Triage the moderation queue

1. Go to `/admin/moderation` (or `/moderation` for global moderators).
2. Review open flags sorted by recency.
3. For each flag, inspect:
   - Target content
   - Author history
   - Reporter reason
   - Whether the flag is `auto_flagged`

### 3. Resolve a flag

Use the API or UI to resolve the flag with one of the following outcomes:

| Resolution | Action |
|------------|--------|
| **Resolved** | Hide the target post/comment (`status = 'hidden'`) and record the resolver + note. Use for content that violates community guidelines. |
| **Dismissed** | Mark the flag as dismissed without changing the target status. Use for false positives or disputes resolved in favor of the author. |

When a flag is resolved, the reporter receives a `flag_resolved` notification.

### 4. Notify or escalate

- For repeated violations by the same author, open a user-conduct ticket.
- For legal or safety issues, escalate to the admin team and freeze the content before resolution.

## Watched phrases

Watched phrases are operator-specific patterns that trigger auto-flagging. They default to **flag only** — content is never auto-hidden or auto-rejected.

### Managing phrases

1. Go to `/admin/watched-phrases`.
2. Add a phrase, an optional `sanctioned_framing` (suggested alternative wording), and whether it is a regex.
3. Set `auto_flag = true` to surface matching content in the moderation queue.

### Default launch phrases

| Phrase | Sanctioned framing |
|--------|--------------------|
| `guaranteed passive income` | `revenue-share models with disclosed risks` |
| `buy now` | `evaluate the tool against your own use case` |

### Guidelines for new phrases

- Keep the list short and operator-specific.
- Avoid broad terms that create false positives.
- Always provide a `sanctioned_framing` when practical.
- Review false-positive rate weekly; target < 10%.

## Escalation path

| Severity | Who | Response time |
|----------|-----|---------------|
| Content policy violation | Moderator / group moderator | Within 24 hours |
| Repeat offender | Global moderator + Community Lead | Within 24 hours |
| Legal, safety, or privacy risk | Admin + Legal | Immediately |
| Platform bug exploited for abuse | Engineering on-call | Within 1 hour |

## Hidden content visibility

Hidden posts and comments remain in the database. They are visible to:

- The original author
- Global `admin` and `moderator` roles
- Circle `admin` and `moderator` roles for that circle

Everyone else sees a placeholder or a `404`, depending on the surface.

## Daily/weekly checks

- [ ] Moderation queue has no open flags older than 24 hours.
- [ ] Watched-phrase false-positive rate is below 10%.
- [ ] No content leak reports from invite-only or paid circles.
- [ ] Escalated flags have a ticket owner and next step.

## Audit log

Keep a short note for each resolved flag:

- Resolver ID
- Resolution (`resolved` or `dismissed`)
- Reason / note
- Any follow-up action taken

The `flags` table stores `resolver_id`, `resolution_note`, and `resolved_at` automatically.
