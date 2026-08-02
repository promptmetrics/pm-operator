import type { Event } from '@pm-operator/api';

const railCardClass =
  'rounded-xl border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-4 shadow-[var(--pm-shadow)]';

const cardTitleClass = 'mb-3 font-serif text-base font-semibold text-[var(--pm-ink)]';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Circle-page rail widget (T8.5): upcoming events scoped to this circle. Server
// component — the page fetches the events list (a single bounded query) and
// passes them in, so this renders no DB calls of its own.
export function UpcomingEventsRail({ events }: { events: Event[] }) {
  if (events.length === 0) return null;

  return (
    <div className={railCardClass}>
      <p className={cardTitleClass}>Upcoming events</p>
      <ul className="flex flex-col gap-3">
        {events.map((event) => {
          const when = formatWhen(event.startsAt);
          // Defense-in-depth: only link out for http(s) urls; the contract also
          // restricts this, but never trust a stored href as <a href> blindly.
          const safeUrl = event.url && /^https?:\/\//i.test(event.url) ? event.url : null;
          const content = (
            <>
              <span className="text-[13px] font-semibold text-[var(--pm-ink)]">
                {event.title}
              </span>
              <span className="block text-xs text-[var(--pm-muted)]">
                {when}
                {event.location ? ` · ${event.location}` : ''}
              </span>
            </>
          );
          return (
            <li key={event.id}>
              {safeUrl ? (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:text-[var(--pm-coral-dark)]"
                >
                  {content}
                </a>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}