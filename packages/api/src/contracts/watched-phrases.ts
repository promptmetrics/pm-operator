import { z } from 'zod';

export const watchedPhraseSchema = z.object({
  id: z.string().uuid(),
  phrase: z.string().min(1),
  sanctionedFraming: z.string().nullable(),
  isRegex: z.boolean(),
  autoFlag: z.boolean(),
  createdAt: z.string().datetime(),
});

export type WatchedPhrase = z.infer<typeof watchedPhraseSchema>;

export const createWatchedPhraseRequestSchema = z.object({
  phrase: z.string().min(1),
  sanctionedFraming: z.string().optional(),
  isRegex: z.boolean().default(false),
  autoFlag: z.boolean().default(true),
});

export type CreateWatchedPhraseRequest = z.infer<typeof createWatchedPhraseRequestSchema>;
