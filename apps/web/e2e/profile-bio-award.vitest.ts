// Phase 3 bio bonus (SEO plan): updateUserProfile fires the one-time +5
// profile_bio award on every save whose bio clears 50 trimmed chars, the
// partial unique index + existence check keep it to a single event across
// repeat saves, and a failed award never fails the profile save.
//
// DB-free: a mock drizzle client (same pattern as badges-concurrency.vitest)
// records the insert calls; the uniqueness race itself is guarded by
// migration 0027's point_events_profile_bio_idx, exercised in CI.
import { describe, expect, test, vi } from 'vitest';

import type { PointEventType } from '@pm-operator/api';

// toUserPublicProfile signs avatar URLs; keep this test storage-free.
vi.mock('../lib/storage', () => ({
  getAvatarReadUrl: async (value: string | null) => value,
}));

const { updateUserProfile } = await import('../lib/services/users');

const USER_ID = '00000000-0000-4000-8000-000000000001';

function userRow(aboutMe: string | null) {
  return {
    id: USER_ID,
    email: 'member@example.com',
    username: 'member',
    userslug: 'member',
    fullName: 'Member',
    pictureUrl: null,
    aboutMe,
    headline: null,
    linkedinUrl: null,
    githubUrl: null,
    role: 'member',
    reputationScore: '0',
    streakDays: 0,
    painfulToolStackTask: 'task',
  };
}

function bioEventRow() {
  const now = new Date('2026-08-22T00:00:00.000Z');
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    userId: USER_ID,
    eventType: 'profile_bio' as PointEventType,
    points: '5',
    sourceId: null,
    groupId: null,
    context: {},
    awardedAt: now,
    createdAt: now,
  };
}

function mockDb(opts: { aboutMe: string; existingEvent?: object | null; insertError?: Error }) {
  const insertReturning = opts.insertError
    ? vi.fn(async () => {
        throw opts.insertError;
      })
    : vi.fn(async () => [bioEventRow()]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  // First lookup finds nothing; once an award exists, every later save does.
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(opts.existingEvent ?? null)
    .mockResolvedValue(opts.existingEvent ?? bioEventRow());

  const updateReturning = vi.fn(async () => [userRow(opts.aboutMe)]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const db = {
    query: { pointEvents: { findFirst }, users: { findFirst: vi.fn() } },
    insert,
    update,
  };
  return { db: db as any, spies: { findFirst, insert, insertValues, insertReturning } };
}

const LONG_BIO =
  'RevOps lead at Northwind, a 40-person B2B SaaS. I run HubSpot and Outreach.';

describe('profile_bio award via updateUserProfile', () => {
  test('awards +5 once; a repeat save inserts no second event', async () => {
    const { db, spies } = mockDb({ aboutMe: LONG_BIO });

    await updateUserProfile(db, USER_ID, { aboutMe: LONG_BIO });
    await updateUserProfile(db, USER_ID, { aboutMe: LONG_BIO });

    expect(spies.insert).toHaveBeenCalledTimes(1);
    expect(spies.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'profile_bio',
        points: '5',
        sourceId: null,
      })
    );
  });

  test('no award when the bio stays under 50 trimmed chars', async () => {
    const { db, spies } = mockDb({ aboutMe: 'Too short.' });

    await updateUserProfile(db, USER_ID, { aboutMe: 'Too short.' });

    expect(spies.findFirst).not.toHaveBeenCalled();
    expect(spies.insert).not.toHaveBeenCalled();
  });

  test('no award when the user already has the event (existence check)', async () => {
    const { db, spies } = mockDb({ aboutMe: LONG_BIO, existingEvent: bioEventRow() });

    await updateUserProfile(db, USER_ID, { aboutMe: LONG_BIO });

    expect(spies.findFirst).toHaveBeenCalledTimes(1);
    expect(spies.insert).not.toHaveBeenCalled();
  });

  test('a failed award is logged, never thrown — the save still succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = mockDb({ aboutMe: LONG_BIO, insertError: new Error('db down') });

    const profile = await updateUserProfile(db, USER_ID, { aboutMe: LONG_BIO });

    expect(profile.id).toBe(USER_ID);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
