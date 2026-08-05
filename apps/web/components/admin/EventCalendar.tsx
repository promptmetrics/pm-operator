'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  groupId: string | null;
  groupName: string | null;
}

export interface EventCalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function EventCalendar({
  events,
  onEventClick,
  currentMonth,
  onMonthChange,
}: EventCalendarProps) {
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Build a map of day -> events
  const eventsByDay = React.useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const event of events) {
      const d = new Date(event.startsAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const existing = map.get(day) ?? [];
        existing.push(event);
        map.set(day, existing);
      }
    }
    return map;
  }, [events, year, month]);

  const prevMonth = () => onMonthChange(new Date(year, month - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, month + 1, 1));

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const selectedEvents = selectedDay !== null ? eventsByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--pm-line)] px-4 py-3">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-lg p-1 text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-sm font-semibold text-[var(--pm-ink)]">{monthLabel}</h3>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-lg p-1 text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-paper-2)] hover:text-[var(--pm-ink)]"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 border-b border-[var(--pm-line)]">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-xs font-medium text-[var(--pm-muted)]"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-[var(--pm-line)] p-1" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayEvents = eventsByDay.get(day) ?? [];
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const isSelected = selectedDay === day;

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={`min-h-[80px] border-b border-r border-[var(--pm-line)] p-1 text-left transition-colors hover:bg-[var(--pm-paper-2)] ${
                isSelected ? 'bg-[var(--pm-paper-2)]' : ''
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday
                    ? 'bg-[var(--pm-coral)] text-[var(--pm-on-ink)] font-semibold'
                    : 'text-[var(--pm-ink)]'
                }`}
              >
                {day}
              </span>
              {dayEvents.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <Circle
                      key={ev.id}
                      className="h-1.5 w-1.5"
                      style={{ color: 'var(--pm-coral)', fill: 'var(--pm-coral)' }}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-[var(--pm-muted)]">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      {selectedDay !== null && (
        <div className="border-t border-[var(--pm-line)] p-3">
          <h4 className="mb-2 text-sm font-medium text-[var(--pm-ink)]">
            Events for {monthLabel} {selectedDay}
          </h4>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-[var(--pm-muted)]">No events on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEventClick?.(event)}
                  className="w-full rounded-lg border border-[var(--pm-line)] bg-[var(--pm-paper-inset)] p-2 text-left transition-colors hover:bg-[var(--pm-paper-2)]"
                >
                  <p className="text-sm font-medium text-[var(--pm-ink)]">{event.title}</p>
                  <p className="text-xs text-[var(--pm-muted)]">
                    {new Date(event.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {event.groupName ? ` · ${event.groupName}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
