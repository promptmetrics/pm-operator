import { eq, sql } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type { PublicUserProfile } from '@pm-operator/api';
import { toPublicUserProfile } from './shared';

const MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

export function extractMentions(text: string): string[] {
  const matches = text.matchAll(MENTION_REGEX);
  return Array.from(new Set(Array.from(matches, (m) => m[1].toLowerCase())));
}

export async function findUserByUsername(
  db: DrizzleClient,
  username: string
): Promise<PublicUserProfile | null> {
  const user = await db.query.users.findFirst({
    where: eq(sql`lower(${schema.users.username})`, username.toLowerCase()),
  });
  if (!user) return null;
  return toPublicUserProfile(user);
}

export async function findMentionedUsers(
  db: DrizzleClient,
  text: string
): Promise<PublicUserProfile[]> {
  const usernames = extractMentions(text);
  if (usernames.length === 0) return [];

  const rows = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) in (${sql.join(usernames.map((u) => sql`${u}`))})`);

  return Promise.all(rows.map((r) => toPublicUserProfile(r)));
}
