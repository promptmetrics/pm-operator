import { test, expect } from 'vitest';

import { POINT_WEIGHTS, PointEventType } from '@pm-operator/api';

// Guards the canonical point economy (SPEC_LOG 2026-08-08, decision D-A):
// invite_accepted pays 15 points to the inviter.
test('invite_accepted point weight is 15 (D-A)', () => {
  expect(POINT_WEIGHTS[PointEventType.INVITE_ACCEPTED]).toBe(15);
});

// Every fixed-weight event type keeps its canonical value; manual_award is
// caller-provided and intentionally absent from POINT_WEIGHTS.
test('POINT_WEIGHTS covers all fixed-weight event types with canonical values', () => {
  expect(POINT_WEIGHTS).toEqual({
    [PointEventType.TOPIC_CREATED]: 10,
    [PointEventType.COMMENT_CREATED]: 5,
    [PointEventType.SOLUTION_ACCEPTED]: 25,
    [PointEventType.LIKE_RECEIVED]: 2,
    [PointEventType.LIKE_GIVEN]: 1,
    [PointEventType.INVITE_ACCEPTED]: 15,
    [PointEventType.DAILY_VISIT]: 0.5,
    [PointEventType.POSTS_READ]: 0.5,
    [PointEventType.STREAK_BONUS]: 2,
  });
  expect(
    Object.keys(POINT_WEIGHTS).includes(PointEventType.MANUAL_AWARD)
  ).toBe(false);
});
