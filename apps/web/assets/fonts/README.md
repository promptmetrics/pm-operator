# Bundled fonts

These files exist for one reason: `app/api/og/devcard/[slug]/route.tsx` renders
the DevCard PNG with satori, and satori needs raw font bytes. Reading them off
disk keeps the OG route free of a request-time fetch to `fonts.googleapis.com`,
which would add latency to every unfurl and fail whenever Google is slow.

| File                        | Family         | Weight | Style  |
| --------------------------- | -------------- | ------ | ------ |
| `Fraunces-Regular.ttf`      | Fraunces       | 400    | normal |
| `Fraunces-Bold.ttf`         | Fraunces       | 700    | normal |
| `JetBrainsMono-Regular.ttf` | JetBrains Mono | 400    | normal |

## Where they came from

Google Fonts, families [Fraunces](https://fonts.google.com/specimen/Fraunces)
v38 and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) v24.
Each file is the **static instance** the CSS API serves for a single weight —
request `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,<weight>`
(or `?family=JetBrains+Mono:wght@400`) and follow the `.ttf` URL in the
`@font-face` block.

Send a `User-Agent` old enough to be offered TrueType but **not** an IE one:
`Mozilla/5.0 (Linux; U; Android 2.2; …)` returns `.ttf`, while an MSIE string
returns Embedded OpenType, which satori cannot parse. Verify with
`file <name>.ttf` — it must say "TrueType Font data".

Static, not variable, is deliberate: the downloads carry no `fvar` table, so
satori rasterises the intended weight instead of falling back to a variable
font's default instance.

Fraunces is the same family the app already loads for `--font-serif`
(`app/globals.css`), so the PNG matches the page.

## Licence

Both families are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/)
— Fraunces © The Fraunces Project Authors (https://github.com/undercasetype/Fraunces),
JetBrains Mono © The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono).
The OFL permits redistribution of the font files as part of this application.

## Replacing them

Re-download from the URL above and keep the filenames — the route resolves
`path.join(process.cwd(), 'assets', 'fonts', …)` with literal names so Next.js
can trace the files into the serverless bundle. Do not rename or move this
directory without updating that route.
