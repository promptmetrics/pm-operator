# GDPR Erasure Request Runbook

This runbook describes how to handle a data-subject erasure request ("right to be forgotten") for `operator.promptmetrics.dev`.

## 1. Receive and log the request

- Record the request in the internal compliance tracker with:
  - Requester email address
  - Date received
  - Ticket / request ID
  - Verification method used (see section 2)
  - Data found and action taken
- Acknowledge receipt within 72 hours with the expected timeline (30 days, or up to 90 days for complex cases).

## 2. Verify identity

Before erasing data, confirm that the requester owns the account.

| Method | When to use |
|--------|-------------|
| Email verification | Send a signed link to the registered email; require click-through. Use for routine requests. |
| Supabase admin lookup | Cross-check the requester email against `auth.users.email` and the `users` table. |
| OAuth linkage | If the account was created via OAuth, verify the linked provider ID matches the request. |
| Manual review | Escalate to a senior admin when the email is no longer accessible or the account is disputed. |

Do not process the request until identity is confirmed. Document the method used.

## 3. Generate a data export (pre-erasure)

The requester has a right to a copy of their data before erasure. Produce a JSON export containing:

- `users` row (profile, preferences, `role`, `reputation_score`, etc.)
- `posts` and `comments` authored by the user
- `reactions` created by the user
- `group_memberships` and `user_memberships`
- `point_events` awarded to the user
- `user_badges` and `notifications` rows
- `flags` filed by or resolved for the user
- `agent_actions` and `mcp_clients` records attributable to the user
- Avatar storage path (actual object is handled in section 7)
- `follows` rows where the user is the follower or the followee (WS9 social graph)
- `conversation_participants` memberships + the `conversations` the user is in, and the user's **sent** `messages` (WS9 DMs). Received messages are the counterparty's authored content — export only the subject's sent messages + conversation metadata, not the counterparty's message bodies (note this limitation in the export).

Use a service-role query or the admin API to generate the export. Store it encrypted and share it only with the verified requester. Retain the export for 90 days in case of dispute, then delete it.

## 4. Anonymize content that must be retained

Some user-generated content may need to remain visible to preserve community context (e.g., accepted solutions, threaded discussions). When retention is required:

- Replace `users.username` and `users.userslug` with a deterministic anonymized label such as `deleted-user-<short-hash>`.
- Remove `email`, `full_name`, `about_me`, `picture_url`, and linked OAuth IDs.
- Keep the post/comment body and metadata; do not re-attribute it to a real person.
- Update search indexes by re-running the materialized FTS/trigram refresh if needed.

If the requester explicitly asks for full deletion of all posts and comments, proceed to hard-delete or set status to `deleted` instead of anonymizing, unless legal/retention exceptions apply.

## 5. Delete personal data

Execute the following service-role operations in a transaction where possible:

1. **Auth user**: delete the row from Supabase `auth.users` via `supabase.auth.admin.deleteUser(id)`.
2. **DM sent-message anonymization (run BEFORE the users-row delete)**: blank the subject's authored message bodies so the counterparty's thread survives with a tombstone instead of PII. `messages.author_id` is `onDelete: 'set null'`, so once the `users` row is gone the subject's messages can no longer be identified by `author_id` — this step must precede step 4.
   ```sql
   UPDATE messages
      SET body = '[message deleted]', content_plain = '[message deleted]'
    WHERE author_id = <user_id>;
   ```
3. **Follows (explicit hard-delete, both directions)**: the `follows` FKs cascade on `users` delete, but deleting explicitly here keeps the count-decrement triggers deterministic and makes the erasure auditable.
   ```sql
   DELETE FROM follows WHERE follower_id = <user_id> OR followee_id = <user_id>;
   ```
4. **Application user**: delete the `users` row. Cascading FKs remove:
   - `group_memberships`
   - `user_memberships`
   - `reactions`
   - `notifications` (as actor or recipient)
   - `point_events`
   - `user_scores`
   - `user_daily_stats`
   - `user_badges`
   - `flags` where the user is reporter or resolver (set to NULL if policy requires retention)
   - `agent_actions`
   - `follows` rows not already removed in step 3 (WS9; both FKs cascade)
   - `conversation_participants` — the user's conversation memberships (WS9; `user_id` FK cascades)
   - `messages` rows are **not** cascade-deleted — `author_id` is set to NULL (WS9; `onDelete: 'set null'`); their bodies were already blanked in step 2, so the counterparty sees `[message deleted]` from a null author
5. **Posts and comments**: decide per request:
   - Full delete: hard-delete rows authored by the user.
   - Anonymized retention: update `author_id` to a sentinel anonymized user ID and clear PII.
6. **Invites**: delete `group_invites` rows where `inviter_id` matches the user.
7. **Orphan-conversation cleanup (run AFTER the users-row delete)**: once the user's `conversation_participants` rows are cascade-removed, any conversation left with zero participants is dead and can be hard-deleted. Run this last.
   ```sql
   DELETE FROM conversations c
    WHERE NOT EXISTS (
      SELECT 1 FROM conversation_participants cp
       WHERE cp.conversation_id = c.id
    );
   ```

Run a final verification query to confirm no `users` row, auth user, or personal identifiers remain.

## 6. Suppress email in Loops

- Call the Loops API to unsubscribe or delete the requester's contact record.
- Record the suppression request ID and timestamp.
- Verify the email no longer appears in Loops audience segments.

If Loops is not yet integrated, document the suppression step and complete it manually once the integration is live.

## 7. Clean up Supabase Storage

- List objects in the `avatars` bucket under `avatars/<user_id>/`.
- Delete all avatar objects for the user.
- If posts/comments were hard-deleted and contained uploaded images in other buckets, remove those objects as well.
- Verify deletion via `supabase.storage.from('avatars').list(...)`.

## 8. Retention exceptions

Do not delete data when one of the following applies:

| Exception | Handling |
|-----------|----------|
| Legal obligation | Retain only the minimum data required, with restricted access and an audit log. |
| Contractual necessity | Anonymize instead of deleting if the content is required for an active contract or dispute. |
| Public interest / freedom of expression | Anonymize posts/comments rather than removing them. |
| Security incident evidence | Freeze the relevant rows and notify legal before any erasure. |

Document the exception and inform the requester that limited data is being retained and why.

## 9. Notify the requester

Send a final email confirming:

- The erasure (or anonymization) was completed.
- The date of completion.
- Any content retained under an exception and the reason.
- That the export copy will be deleted after 90 days.

## 10. Audit and close

- Keep a redacted audit log for 6 years:
  - Request ID
  - Verification method
  - Data categories deleted or anonymized
  - Storage cleanup confirmation
  - Loops suppression confirmation
  - Exceptions applied
- Mark the compliance ticket as resolved.

## Quick command reference

```bash
# Run the seed/migrate target database must already have DATABASE_URL set.
pnpm db:migrate
pnpm db:seed

# For erasure, use a service-role script that imports createDrizzleClient
# and supabase.auth.admin.deleteUser.
```
