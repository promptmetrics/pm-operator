import { z } from 'zod';

// Server-generated link preview card ({url, domain, title, desc} per the
// design — no image field, so no thumbnail storage or proxying). The server
// is the source of truth: previews are built by lib/services/unfurl.ts on
// write, never accepted from the client.
export const linkPreviewSchema = z.object({
  url: z.string().url().max(2048),
  domain: z.string().min(1).max(255),
  title: z.string().min(1).max(200),
  desc: z.string().max(300).nullable(),
});

export type LinkPreview = z.infer<typeof linkPreviewSchema>;

// POST /api/v1/unfurl — composer-side preview. Cosmetic only; the server
// re-fetches on save.
export const unfurlRequestSchema = z.object({
  url: z.string().url().max(2048),
});

export type UnfurlRequest = z.infer<typeof unfurlRequestSchema>;

export const unfurlResponseSchema = linkPreviewSchema.nullable();

export type UnfurlResponse = z.infer<typeof unfurlResponseSchema>;
