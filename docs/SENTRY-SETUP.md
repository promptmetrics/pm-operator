# Sentry setup for pm-operator

This project uses [Sentry](https://sentry.io) for error tracking and performance monitoring in the Next.js app (`apps/web`).

## Required environment variables

Add these to `apps/web/.env.local` (local development) and to the Vercel project environment variables (production/preview):

```bash
NEXT_PUBLIC_SENTRY_DSN=<public DSN from Sentry project settings>
SENTRY_DSN=<same public DSN>
SENTRY_ORG=<your-sentry-org-slug>
SENTRY_PROJECT=pm-operator
SENTRY_AUTH_TOKEN=<auth-token-with-project-write-scope>
```

`NEXT_PUBLIC_SENTRY_DSN` is used by the browser SDK. `SENTRY_DSN` is used by the server/edge SDKs.

## CLI setup notes

1. Create an auth token at https://sentry.io/settings/account/api/auth-tokens/ with scopes:
   - `org:read`
   - `project:read`
   - `project:write`

2. Export the token in your shell:
   ```bash
   export SENTRY_AUTH_TOKEN=<token>
   ```

3. Create the project via CLI:
   ```bash
   pnpm --filter @pm-operator/web exec sentry-cli projects create --org <org-slug> --name pm-operator
   ```

4. Copy the DSN from the project settings and set `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`.

## Source maps

Source maps are uploaded automatically during production builds by `withSentryConfig` in `apps/web/next.config.ts`. The upload only runs when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set.

## GitHub integration

To create GitHub issues from Sentry errors:

1. In Sentry, go to **Settings > Integrations > GitHub** and install the GitHub integration for the `promptmetrics` organization.
2. Link the `pm-operator` repository.
3. In the Sentry project settings, enable **Issue Tracking > GitHub** and configure the default repository.

## Local behavior

In development, the client SDK suppresses events by default to avoid consuming Sentry quota while iterating. Set `SENTRY_ENABLE_DEV=1` to send events from localhost.
