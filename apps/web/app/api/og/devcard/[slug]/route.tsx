import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { createServiceDb } from '@/lib/db';
import { getDevCardSummary, type DevCardSummary } from '@/lib/services/users';

// T5G: server-rendered DevCard PNG — the image OG unfurlers fetch for
// /u/[slug]/devcard, and the file the "Download PNG" action saves.
//
// Node runtime, not edge: Drizzle needs Node, and the Fraunces font is read
// off disk. Data is fetched HERE and only primitives cross into the JSX below,
// because satori renders the tree synchronously and cannot await a query.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;

// Sea Glass tokens, inlined as literals: satori resolves no CSS custom
// properties, so var(--pm-*) would silently render as transparent/black.
// Keep these in sync with packages/ui/src/styles/tokens.css.
const PAPER = '#e9f1ee'; // --pm-paper
const PAPER_INSET = '#f6faf8'; // --pm-paper-inset
const INK = '#161c1a'; // --pm-ink
const MUTED = '#5e6f68'; // --pm-muted
const LINE = '#cddcd6'; // --pm-line
const CORAL = '#b8446a'; // --pm-coral
const TEAL = '#3f8f82'; // --pm-teal
const TEAL_DARK = '#276358'; // --pm-teal-dark

// Read once per lambda instance, then reused. The files are committed under
// apps/web/assets/fonts (see the README there) precisely so this never becomes
// a request-time fetch to fonts.googleapis.com.
let fontsPromise: Promise<{ regular: Buffer; bold: Buffer }> | undefined;

function loadFonts() {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    fontsPromise = Promise.all([
      readFile(path.join(dir, 'Fraunces-Regular.ttf')),
      readFile(path.join(dir, 'Fraunces-Bold.ttf')),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontsPromise;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flex: 1,
        padding: '28px 16px',
        borderRadius: 20,
        border: `1px solid ${LINE}`,
        backgroundColor: PAPER_INSET,
      }}
    >
      <div style={{ fontSize: 60, fontWeight: 700, color: INK, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 22, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}

function DevCardImage({ summary }: { summary: DevCardSummary }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PAPER,
        fontFamily: 'Fraunces',
      }}
    >
      {/* Teal cover band, mirroring the page header. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          height: 190,
          padding: '40px 56px',
          backgroundImage: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 4, color: '#ffffff' }}>
          OPERATOR STACK
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            letterSpacing: 4,
            color: '#ffffff',
            opacity: 0.85,
            border: '1px solid rgba(255,255,255,0.55)',
            borderRadius: 999,
            padding: '8px 22px',
          }}
        >
          DEVCARD
        </div>
      </div>

      {/* flex:1 + space-between distributes the three blocks over whatever
          height is left below the band, so the card never bottoms out early. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '0 56px 52px 56px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: -60 }}>
          {/* Monogram instead of the avatar: a remote picture would mean a
              request-time fetch that can hang or 404 the whole image. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 140,
              height: 140,
              borderRadius: 999,
              border: `6px solid ${PAPER}`,
              backgroundColor: PAPER_INSET,
              color: TEAL_DARK,
              fontSize: 54,
              fontWeight: 700,
            }}
          >
            {initials(summary.displayName)}
          </div>

          {/* minWidth:0 + ellipsis everywhere below: without it a long display
              name squeezes the monogram to a sliver and runs off the canvas. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              gap: 8,
              paddingTop: 56,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 16 }}>
              <div
                style={{
                  fontSize: 58,
                  fontWeight: 700,
                  color: INK,
                  lineHeight: 1.1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {summary.displayName}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  minWidth: 46,
                  height: 46,
                  borderRadius: 999,
                  backgroundColor: CORAL,
                  color: '#ffffff',
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                {summary.level}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                color: MUTED,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {`@${summary.userslug} · Joined ${formatJoined(summary.joinedAt)}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          <Stat label="Posts" value={summary.postsCount.toLocaleString()} />
          <Stat label="Solutions" value={summary.acceptedSolutions.toLocaleString()} />
          <Stat label="Streak" value={`${summary.streakDays}d`} />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 24,
            color: MUTED,
          }}
        >
          <div style={{ display: 'flex' }}>
            {`${summary.reputationScore.toLocaleString()} points`}
          </div>
          <div style={{ display: 'flex' }}>promptmetrics.dev</div>
        </div>
      </div>
    </div>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // 2 queries, awaited before any JSX is constructed (see getDevCardSummary).
  const summary = await getDevCardSummary(createServiceDb(), slug);

  // Unknown slug is an ordinary 404, never a thrown render.
  if (!summary) {
    return new Response('DevCard not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const fonts = await loadFonts();

  return new ImageResponse(<DevCardImage summary={summary} />, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Fraunces', data: fonts.regular, weight: 400, style: 'normal' },
      { name: 'Fraunces', data: fonts.bold, weight: 700, style: 'normal' },
    ],
    headers: {
      'Content-Type': 'image/png',
      // Public card: cheap for unfurlers to hammer, but stats do move, so keep
      // the shared cache short and let stale copies serve while revalidating.
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
