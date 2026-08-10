'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Hash, FileText, User } from 'lucide-react';
import { Avatar } from '@pm-operator/ui/components/Avatar';
import type { PaletteResponse } from '@pm-operator/api';

// Hand-rolled ⌘K palette (redesign plan §4). Deliberately no `cmdk`: the scope
// is 9 rows across 3 fixed groups, and a dependency's own styling fights the
// var(--pm-*) token system.
//
// ARIA follows the combobox + aria-activedescendant pattern — DOM focus never
// leaves the input, so rows are `tabIndex={-1}` anchors marked aria-selected
// rather than focusable elements.

const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;
// paletteQuerySchema caps q at 64; clamping the field avoids guaranteed 400s.
const MAX_QUERY = 64;

const EMPTY_RESULTS: PaletteResponse = { circles: [], posts: [], people: [] };

type RowKind = 'circle' | 'post' | 'person';

interface Row {
  index: number;
  kind: RowKind;
  key: string;
  href: string;
  title: string;
  meta: string | null;
  avatarUrl: string | null;
}

const KIND_LABEL: Record<RowKind, string> = {
  circle: 'Circle',
  post: 'Post',
  person: 'Person',
};

const KIND_ICON: Record<RowKind, typeof Hash> = {
  circle: Hash,
  post: FileText,
  person: User,
};

// Reference kind chips: Circle entries get a teal chip, Post entries a
// raspberry one, people stay neutral.
const KIND_CHIP_CLASS: Record<RowKind, string> = {
  circle:
    'bg-[color-mix(in_srgb,var(--pm-teal)_14%,transparent)] text-[var(--pm-teal-dark)]',
  post: 'bg-[var(--pm-coral-tint)] text-[var(--pm-coral-dark)]',
  person: 'border border-[var(--pm-line)] bg-[var(--pm-paper)] text-[var(--pm-muted)]',
};

function buildRows(results: PaletteResponse): Row[] {
  const rows: Omit<Row, 'index'>[] = [
    ...results.circles.map((circle) => ({
      kind: 'circle' as const,
      key: `circle-${circle.id}`,
      href: `/g/${circle.slug}`,
      title: circle.name,
      meta: `${circle.memberCount.toLocaleString()} ${circle.memberCount === 1 ? 'member' : 'members'}`,
      avatarUrl: null,
    })),
    ...results.posts.map((post) => ({
      kind: 'post' as const,
      key: `post-${post.id}`,
      // The palette contract carries the post id but no post slug, and
      // /g/[groupSlug]/[postSlug] resolves through getPostBySlug — an id would
      // 404 there. /p/[id] is the existing canonical-redirect route: it looks
      // the slug up and permanentRedirects to /g/{circleSlug}/{postSlug}.
      href: `/p/${post.id}`,
      title: post.title,
      meta: `▲ ${post.upvotes.toLocaleString()}`,
      avatarUrl: null,
    })),
    ...results.people.map((person) => ({
      kind: 'person' as const,
      key: `person-${person.id}`,
      href: `/u/${person.slug}`,
      title: person.name,
      meta: null,
      avatarUrl: person.avatarUrl,
    })),
  ];
  return rows.map((row, index) => ({ ...row, index }));
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<PaletteResponse | null>(null);
  const [defaults, setDefaults] = React.useState<PaletteResponse | null>(null);
  const [defaultsFailed, setDefaultsFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const listId = React.useId();
  const titleId = React.useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const trimmed = query.trim();
  // Below the search threshold the palette shows default suggestions (the
  // viewer's circles + top posts) instead of an empty prompt.
  const searching = trimmed.length >= MIN_QUERY;
  const source = searching ? results : defaults;
  const rows = React.useMemo(() => (source ? buildRows(source) : []), [source]);

  const groups = React.useMemo(
    () =>
      (
        [
          { label: 'Circles', kind: 'circle' as const },
          { label: 'Posts', kind: 'post' as const },
          { label: 'People', kind: 'person' as const },
        ]
      )
        .map((group) => ({ ...group, rows: rows.filter((row) => row.kind === group.kind) }))
        .filter((group) => group.rows.length > 0),
    [rows]
  );

  // Mount = open. Capture the trigger, move focus into the field, and lock body
  // scroll; the cleanup restores all three, so closing always returns focus to
  // whatever opened the palette (search pill, or the ⌘K caller).
  React.useEffect(() => {
    const previous = document.activeElement;
    restoreFocusRef.current =
      previous instanceof HTMLElement && previous !== document.body ? previous : null;
    inputRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  // Fetch the default suggestions once, on open. The response shape is the
  // same as a search response; the server fills it from the viewer's circles
  // and the top posts they can see when q is empty.
  React.useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/v1/palette', { signal: controller.signal });
        if (!res.ok) throw new Error('Palette suggestions failed');
        const json = (await res.json()) as { data?: PaletteResponse };
        if (controller.signal.aborted) return;
        setDefaults(json.data ?? EMPTY_RESULTS);
      } catch {
        if (!controller.signal.aborted) setDefaultsFailed(true);
      }
    })();
    return () => controller.abort();
  }, []);

  // Debounced, abortable search. The cleanup aborts the in-flight request
  // whenever `query` changes, and every state write is gated on
  // `signal.aborted`, so a superseded response can never land out of order.
  React.useEffect(() => {
    if (trimmed.length < MIN_QUERY) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/palette?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Palette search failed');
        const json = (await res.json()) as { data?: PaletteResponse };
        if (controller.signal.aborted) return;
        setResults(json.data ?? EMPTY_RESULTS);
        setFailed(false);
      } catch {
        if (controller.signal.aborted) return;
        setResults(EMPTY_RESULTS);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  React.useEffect(() => {
    setActive(0);
  }, [rows]);

  const go = React.useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Tab') {
      // Only the input and the close button are focusable, so the trap is a
      // two-element cycle — but query the DOM so it survives future additions.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (rows.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (prev + 1) % rows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (prev - 1 + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      const row = rows[active];
      if (row) {
        event.preventDefault();
        go(row.href);
      }
    }
  };

  const status = failed
    ? 'Search is unavailable right now. Try again.'
    : searching
      ? loading && rows.length === 0
        ? 'Searching…'
        : rows.length === 0
          ? `No results for “${trimmed}”`
          : null
      : defaultsFailed
        ? 'Suggestions are unavailable right now. Start typing to search.'
        : defaults === null
          ? 'Loading suggestions…'
          : rows.length === 0
            ? 'Start typing to search circles, posts and people.'
            : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--pm-ink)]/40 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-[var(--pm-radius-xl)] border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] shadow-[var(--pm-shadow-lg)]"
      >
        <h2 id={titleId} className="sr-only">
          Search posts, circles and people
        </h2>

        <div className="flex items-center gap-3 border-b border-[var(--pm-line)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--pm-muted)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={rows.length > 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search posts, circles and people"
            value={query}
            maxLength={MAX_QUERY}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts, circles, people…"
            className="flex-1 bg-transparent text-[var(--pm-text-base)] text-[var(--pm-ink)] placeholder:text-[var(--pm-muted-soft)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 rounded-[var(--pm-radius-sm)] p-1 text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pm-focus)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          aria-busy={loading}
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {groups.map((group) => (
            <div key={group.kind} role="group" aria-label={group.label}>
              <div
                aria-hidden="true"
                className="px-2 pb-1 pt-2 text-[var(--pm-text-xs)] font-semibold uppercase tracking-wide text-[var(--pm-muted)]"
              >
                {group.label}
              </div>
              {group.rows.map((row) => (
                <PaletteRow
                  key={row.key}
                  row={row}
                  id={optionId(row.index)}
                  selected={row.index === active}
                  onHover={() => setActive(row.index)}
                  onActivate={() => go(row.href)}
                />
              ))}
            </div>
          ))}

          {status ? (
            <p
              role="status"
              className="px-3 py-6 text-center text-[var(--pm-text-sm)] text-[var(--pm-muted)]"
            >
              {status}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--pm-line)] bg-[var(--pm-paper-2)] px-4 py-2 text-[var(--pm-text-xs)] text-[var(--pm-muted)]">
          <span>
            <kbd className="rounded border border-[var(--pm-line)] bg-[var(--pm-paper)] px-1 font-sans">↑</kbd>{' '}
            <kbd className="rounded border border-[var(--pm-line)] bg-[var(--pm-paper)] px-1 font-sans">↓</kbd> to
            navigate
          </span>
          <span>
            <kbd className="rounded border border-[var(--pm-line)] bg-[var(--pm-paper)] px-1 font-sans">Enter</kbd> to
            open
          </span>
          <span>
            <kbd className="rounded border border-[var(--pm-line)] bg-[var(--pm-paper)] px-1 font-sans">Esc</kbd> to
            close
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  row,
  id,
  selected,
  onHover,
  onActivate,
}: {
  row: Row;
  id: string;
  selected: boolean;
  onHover: () => void;
  onActivate: () => void;
}) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  const Icon = KIND_ICON[row.kind];

  // DOM focus stays on the combobox, so scroll the active row into view by hand.
  React.useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <a
      ref={ref}
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      href={row.href}
      onMouseMove={onHover}
      onClick={(event) => {
        // Let the browser own modified clicks (new tab / new window).
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onActivate();
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-[var(--pm-radius-md)] px-3 py-2 no-underline ${
        selected
          ? 'bg-[var(--pm-coral-tint)] text-[var(--pm-ink)] ring-1 ring-inset ring-[var(--pm-coral)]'
          : 'text-[var(--pm-ink-2)]'
      }`}
    >
      {row.kind === 'person' ? (
        <Avatar
          src={row.avatarUrl ?? undefined}
          alt=""
          fallback={row.title}
          size="xs"
          className="shrink-0"
        />
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-[var(--pm-muted)]" aria-hidden="true" />
      )}

      <span className="min-w-0 flex-1 truncate text-[var(--pm-text-sm)] font-medium">{row.title}</span>

      {row.meta ? (
        <span className="hidden shrink-0 text-[var(--pm-text-xs)] text-[var(--pm-muted)] sm:inline">{row.meta}</span>
      ) : null}

      <span
        className={`shrink-0 rounded-[var(--pm-radius-pill)] px-2 py-0.5 text-[var(--pm-text-xs)] ${KIND_CHIP_CLASS[row.kind]}`}
      >
        {KIND_LABEL[row.kind]}
      </span>
    </a>
  );
}
