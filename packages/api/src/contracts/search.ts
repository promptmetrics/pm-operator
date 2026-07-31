import { z } from 'zod';
import { postListItemSchema } from './posts';

export const SearchSort = {
  RELEVANCE: 'relevance',
  NEW: 'new',
  TOP: 'top',
} as const;

export type SearchSort = (typeof SearchSort)[keyof typeof SearchSort];

export const searchSortSchema = z.nativeEnum(
  SearchSort as Record<string, string>
) as z.ZodType<SearchSort>;

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  groupSlug: z.string().optional(),
  tags: z
    .string()
    .transform((val) => (val ? val.split(',').map((s) => s.trim()) : []))
    .optional(),
  sort: searchSortSchema.default(SearchSort.RELEVANCE),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = postListItemSchema.extend({
  rank: z.number().nonnegative(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  nextCursor: z.string().datetime().optional(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
