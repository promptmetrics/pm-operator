import { z } from 'zod';

// T8.5: community events. Optionally scoped to a circle (groupSlug unset =>
// global event). Dates are ISO strings at the API boundary (toISO on the way out).

export const eventSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  location: z.string().nullable(),
  url: z.string().nullable(),
  capacity: z.number().int().positive().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Event = z.infer<typeof eventSchema>;

export const createEventRequestSchema = z.object({
  groupSlug: z.string().min(1).optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  location: z.string().max(300).optional(),
  // Restrict to http(s) — z.string().url() alone accepts javascript:/data:
  // schemes, and the rail renders this as <a href>, a stored-XSS vector.
  url: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//i.test(v), 'Only http(s) URLs are allowed')
    .optional(),
  capacity: z.number().int().positive().optional(),
});
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;

export const updateEventRequestSchema = createEventRequestSchema.partial();
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;

export const listEventsQuerySchema = z.object({
  groupSlug: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // upcoming=true (default) returns only events with starts_at >= now, ordered
  // ascending; false returns past events descending.
  upcoming: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;