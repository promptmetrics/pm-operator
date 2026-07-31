import { z } from 'zod';

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorCodeSchema = z.nativeEnum(
  ErrorCode as Record<string, string>
) as z.ZodType<ErrorCode>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    field: z.string().nullable().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  totalCount: z.number().int().nonnegative().optional(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: paginationMetaSchema.optional(),
  });

export type SuccessEnvelope<T> = {
  data: T;
  meta?: PaginationMeta;
};

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export const uuidSchema = z.string().uuid();
