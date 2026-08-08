# Bundled fonts

These files exist for one reason: `app/api/og/devcard/[slug]/route.tsx` renders
the DevCard PNG with satori, and satori needs raw font bytes. Reading them off
disk keeps the OG route free of a request-time fetch to `fonts.googleapis.com`,
which would add latency to every unfurl and fail whenever Google is slow.

| File                   | Family   | Weight | Style  |
| ---------------------- | -------- | ------ | ------ |
| `Fraunces-Regular.ttf` | Fraunces | 400    | normal |
| `Fraunces-Bold.ttf`    | Fraunces | 700    | normal |

## Where they came from

Google Fonts, family [Fraunces](https://fonts.google.com/specimen/Fraunces),
v38. Each file is the **static instance** the CSS API serves for a single
weight — request `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,<weight>`
with a legacy `User-Agent` and follow the `.ttf` URL in the `@font-face` block.

Static, not variable, is deliberate: the downloads carry no `fvar` table, so
satori rasterises the intended weight instead of falling back to a variable
font's default instance.

Fraunces is the same family the app already loads for `--font-serif`
(`app/globals.css`), so the PNG matches the page.

## Licence

Fraunces is licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/),
Copyright The Fraunces Project Authors (https://github.com/undercasetype/Fraunces).
The OFL permits redistribution of the font files as part of this application.

## Replacing them

Re-download from the URL above and keep the filenames — the route resolves
`path.join(process.cwd(), 'assets', 'fonts', …)` with literal names so Next.js
can trace the files into the serverless bundle. Do not rename or move this
directory without updating that route.
