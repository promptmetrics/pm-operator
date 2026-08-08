'use client';

export interface LinkPreviewData {
  url: string;
  domain: string;
  title: string;
  desc?: string | null;
}

export function LinkPreviewCard({ preview }: { preview: LinkPreviewData }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mt-3 block rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] px-3.5 py-2.5 transition-colors hover:border-[var(--pm-line-2)]"
    >
      <span className="block text-xs uppercase tracking-wide text-[var(--pm-muted-soft)]">
        {preview.domain}
      </span>
      <span className="mt-0.5 block text-sm font-medium text-[var(--pm-ink)]">{preview.title}</span>
      {preview.desc ? (
        <span className="mt-0.5 block text-sm text-[var(--pm-muted)] line-clamp-2">
          {preview.desc}
        </span>
      ) : null}
    </a>
  );
}
