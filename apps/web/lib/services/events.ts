import { eq, and, gte, lte, asc, desc, type SQL } from 'drizzle-orm';
import type { DrizzleClient } from '@pm-operator/db';
import * as schema from '@pm-operator/db';
import type {
  Event,
  CreateEventRequest,
  UpdateEventRequest,
  ListEventsQuery,
} from '@pm-operator/api';
import { toISO } from './shared';

// T8.5: community events. Optionally scoped to a circle (groupId null =>
// global event). Dates cross the boundary as ISO strings (toISO on the way
// out; contracts use z.string().datetime()). Every function stays within the
// pool-starvation budget (≤3 concurrent queries) by keeping its queries
// sequential — there is no Promise.all here, and no multi-CTE db.execute.

type EventRow = typeof schema.events.$inferSelect;

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    description: row.description,
    startsAt: toISO(row.startsAt),
    endsAt: row.endsAt ? toISO(row.endsAt) : null,
    location: row.location,
    url: row.url,
    capacity: row.capacity,
    createdBy: row.createdBy,
    createdAt: toISO(row.createdAt),
    updatedAt: toISO(row.updatedAt),
  };
}

// Mirrors the events RLS policies: site admins/moderators may write any event;
// circle admins/moderators may write their circle's events; global events
// (groupId null) are site-admin/mod-only. Runs as the service role (bypasses
// RLS), so the service must enforce this itself.
async function canManageEvent(
  db: DrizzleClient,
  groupId: string | null,
  userId: string
): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { role: true },
  });
  if (user?.role === 'admin' || user?.role === 'moderator') return true;
  if (!groupId) return false;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(schema.groupMemberships.groupId, groupId),
      eq(schema.groupMemberships.userId, userId)
    ),
    columns: { role: true },
  });
  return membership?.role === 'admin' || membership?.role === 'moderator';
}

async function resolveGroupSlug(
  db: DrizzleClient,
  groupSlug: string
): Promise<string | null> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.slug, groupSlug),
    columns: { id: true },
  });
  return group?.id ?? null;
}

export async function createEvent(
  db: DrizzleClient,
  input: CreateEventRequest,
  userId: string
): Promise<Event> {
  let groupId: string | null = null;
  if (input.groupSlug) {
    groupId = await resolveGroupSlug(db, input.groupSlug);
    if (!groupId) throw new Error('Group not found');
  }

  const allowed = await canManageEvent(db, groupId, userId);
  if (!allowed) throw new Error('Forbidden');

  const [created] = await db
    .insert(schema.events)
    .values({
      groupId,
      title: input.title,
      description: input.description ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      location: input.location ?? null,
      url: input.url ?? null,
      capacity: input.capacity ?? null,
      createdBy: userId,
    })
    .returning();
  if (!created) throw new Error('Failed to create event');
  return toEvent(created);
}

export async function getEvent(db: DrizzleClient, id: string): Promise<Event | null> {
  const row = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  return row ? toEvent(row) : null;
}

export async function listEvents(
  db: DrizzleClient,
  query: ListEventsQuery
): Promise<Event[]> {
  let groupId: string | undefined;
  if (query.groupSlug) {
    const resolved = await resolveGroupSlug(db, query.groupSlug);
    if (!resolved) return [];
    groupId = resolved;
  }

  const where: SQL[] = [];
  if (groupId !== undefined) where.push(eq(schema.events.groupId, groupId));
  if (query.from) where.push(gte(schema.events.startsAt, new Date(query.from)));
  if (query.to) where.push(lte(schema.events.startsAt, new Date(query.to)));
  if (query.upcoming) {
    where.push(gte(schema.events.startsAt, new Date()));
  } else {
    // upcoming=false => past events only (contract: "false returns past events
    // descending"). Without this, no date filter applied and future events
    // would be returned too.
    where.push(lte(schema.events.startsAt, new Date()));
  }

  const order = query.upcoming ? asc(schema.events.startsAt) : desc(schema.events.startsAt);
  const filter = where.length > 0 ? and(...where) : undefined;

  // Explicit builder (not db.query.events.findMany) for stable type inference.
  const rows = await db
    .select()
    .from(schema.events)
    .where(filter)
    .orderBy(order)
    .limit(query.limit)
    .offset(query.offset);
  return rows.map(toEvent);
}

export async function updateEvent(
  db: DrizzleClient,
  id: string,
  input: UpdateEventRequest,
  userId: string
): Promise<Event> {
  const existing = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  if (!existing) throw new Error('Event not found');

  const allowed = await canManageEvent(db, existing.groupId, userId);
  if (!allowed) throw new Error('Forbidden');

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) set.title = input.title;
  if (input.description !== undefined) set.description = input.description ?? null;
  if (input.startsAt !== undefined) set.startsAt = new Date(input.startsAt);
  if (input.endsAt !== undefined) set.endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.location !== undefined) set.location = input.location ?? null;
  if (input.url !== undefined) set.url = input.url ?? null;
  if (input.capacity !== undefined) set.capacity = input.capacity ?? null;

  const [updated] = await db
    .update(schema.events)
    .set(set)
    .where(eq(schema.events.id, id))
    .returning();
  if (!updated) throw new Error('Failed to update event');
  return toEvent(updated);
}

export async function deleteEvent(
  db: DrizzleClient,
  id: string,
  userId: string
): Promise<{ id: string }> {
  const existing = await db.query.events.findFirst({ where: eq(schema.events.id, id) });
  if (!existing) throw new Error('Event not found');

  const allowed = await canManageEvent(db, existing.groupId, userId);
  if (!allowed) throw new Error('Forbidden');

  await db.delete(schema.events).where(eq(schema.events.id, id));
  return { id };
}