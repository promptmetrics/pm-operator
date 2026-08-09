import { describe, it, expect } from 'vitest';
import {
  countDelta,
  durationDelta,
  formatDuration,
  formatRate,
  nullableValue,
  rateDelta,
  weekdayLabel,
} from '@/components/admin/dashboard-metrics';

/**
 * The dashboard's null handling is the part most likely to regress into
 * nonsense on screen ("0%" for a week that had no questions at all), and it is
 * pure arithmetic — so it is pinned here rather than in the Playwright spec,
 * where the seeded windows cannot be forced into every shape.
 */

describe('formatDuration', () => {
  it('keeps sub-minute gaps in seconds', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('renders whole hours without a stray minute component', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('renders the hours-and-minutes case the brief calls for', () => {
    expect(formatDuration(4 * 3600 + 12 * 60)).toBe('4h 12m');
  });

  it('rolls over into days', () => {
    expect(formatDuration(2 * 86400 + 3 * 3600)).toBe('2d 3h');
  });
});

describe('nullableValue', () => {
  it('reads as "No data" when the window has no qualifying rows', () => {
    expect(nullableValue(null, formatRate)).toBe('No data');
  });

  it('does not confuse a genuine zero with missing data', () => {
    expect(nullableValue(0, formatRate)).toBe('0%');
  });
});

describe('countDelta', () => {
  it('shows a signed percentage against the prior week', () => {
    expect(countDelta({ current: 12, prior: 10 })).toMatchObject({
      direction: 'up',
      tone: 'positive',
      label: '+20%',
      caption: 'vs. prior week',
    });
  });

  it('marks a fall as negative', () => {
    expect(countDelta({ current: 8, prior: 10 })).toMatchObject({
      direction: 'down',
      tone: 'negative',
      label: '-20%',
    });
  });

  it('says so plainly when nothing moved', () => {
    expect(countDelta({ current: 10, prior: 10 })).toMatchObject({
      direction: 'flat',
      label: 'No change',
    });
  });

  it('shows the absolute gain rather than dividing by a prior week of zero', () => {
    expect(countDelta({ current: 5, prior: 0 })).toMatchObject({
      direction: 'up',
      label: '+5',
      caption: 'vs. 0 last week',
    });
  });

  it('treats two empty weeks as no change, not as an infinite jump', () => {
    expect(countDelta({ current: 0, prior: 0 })).toMatchObject({
      direction: 'flat',
      label: 'No change',
    });
  });
});

describe('rateDelta', () => {
  it('compares rates in percentage points', () => {
    expect(rateDelta({ current: 0.6, prior: 0.5 })).toMatchObject({
      direction: 'up',
      tone: 'positive',
      label: '+10 pts',
    });
  });

  it('renders a missing prior week as an explanation, never as 0%', () => {
    const delta = rateDelta({ current: 0.5, prior: null });
    expect(delta.direction).toBe('none');
    expect(delta.label).toBe('No prior week to compare');
    expect(delta.label).not.toContain('0%');
  });

  it('distinguishes a missing current week from a missing prior one', () => {
    expect(rateDelta({ current: null, prior: 0.5 })).toMatchObject({
      direction: 'none',
      label: 'No data this week',
    });
  });
});

describe('durationDelta', () => {
  it('treats answering faster as the good outcome even though the number fell', () => {
    expect(durationDelta({ current: 3600, prior: 18000 })).toMatchObject({
      direction: 'down',
      tone: 'positive',
      label: '-4h',
    });
  });

  it('treats a slower week as bad', () => {
    expect(durationDelta({ current: 18000, prior: 3600 })).toMatchObject({
      direction: 'up',
      tone: 'negative',
      label: '+4h',
    });
  });

  it('refuses to compare against a week with no answered questions', () => {
    expect(durationDelta({ current: 3600, prior: null })).toMatchObject({
      direction: 'none',
      label: 'No prior week to compare',
    });
  });
});

describe('weekdayLabel', () => {
  it('reads a YYYY-MM-DD bucket as local time so the label cannot shift a day', () => {
    expect(weekdayLabel('2026-08-09')).toBe('Sun');
  });
});
