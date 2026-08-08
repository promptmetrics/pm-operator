import { z } from 'zod';

// ⌘K command-palette search (redesign plan §4.2). Deliberately separate from
// the /search contract: palette results are small fixed-size buckets with no
// pagination or sort semantics.

export const paletteQuerySchema = z.object({
  q: z.string().trim().min(2).max(64),
});

export type PaletteQuery = z.infer<typeof paletteQuerySchema>;

export const paletteCircleSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
});

export type PaletteCircle = z.infer<typeof paletteCircleSchema>;

export const palettePostSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  circleSlug: z.string(),
  circleName: z.string(),
});

export type PalettePost = z.infer<typeof palettePostSchema>;

export const palettePersonSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
});

export type PalettePerson = z.infer<typeof palettePersonSchema>;

export const paletteResponseSchema = z.object({
  circles: z.array(paletteCircleSchema).max(3),
  posts: z.array(palettePostSchema).max(5),
  people: z.array(palettePersonSchema).max(3),
});

export type PaletteResponse = z.infer<typeof paletteResponseSchema>;
