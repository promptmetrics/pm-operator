'use client';

import dynamic from 'next/dynamic';

// TipTap (+ ProseMirror) is the single biggest chunk on the public post page,
// and anonymous readers can never mount an editor. Loading it on demand keeps
// it out of the crawler-facing first-load JS entirely (audit item 6: a 127KB
// chunk 92% unused on post views). `ssr: false` is correct — the editor is
// client-only and every consumer is already a client component.
export const RichTextEditor = dynamic(
  () => import('@pm-operator/ui/editor/RichTextEditor').then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[120px] animate-pulse rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)]"
        aria-hidden
      />
    ),
  }
);
