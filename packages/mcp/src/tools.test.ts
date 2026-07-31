import { describe, it, expect } from 'vitest';
import {
  searchPostsSchema,
  getUserProfileSchema,
  listLeaderboardsSchema,
  summarizeThreadSchema,
} from './tools';

describe('tool schemas', () => {
  describe('searchPostsSchema', () => {
    it('accepts a minimal valid query', () => {
      const result = searchPostsSchema.safeParse({ query: 'hello' });
      expect(result.success).toBe(true);
    });

    it('accepts a fully populated valid query', () => {
      const result = searchPostsSchema.safeParse({
        query: 'hello',
        group_slug: 'my-group',
        tags: ['tag1', 'tag2'],
        sort: 'top',
        page: 2,
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty query', () => {
      const result = searchPostsSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid sort value', () => {
      const result = searchPostsSchema.safeParse({ query: 'hello', sort: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects out-of-range limit', () => {
      const result = searchPostsSchema.safeParse({ query: 'hello', limit: 100 });
      expect(result.success).toBe(false);
    });
  });

  describe('getUserProfileSchema', () => {
    it('accepts a valid user slug', () => {
      const result = getUserProfileSchema.safeParse({ user_slug: 'john-doe' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty user slug', () => {
      const result = getUserProfileSchema.safeParse({ user_slug: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing user slug', () => {
      const result = getUserProfileSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('listLeaderboardsSchema', () => {
    it('accepts a valid minimal request', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'all-time' });
      expect(result.success).toBe(true);
    });

    it('accepts a valid request with group and period', () => {
      const result = listLeaderboardsSchema.safeParse({
        type: 'operator-stack',
        group_slug: 'ops',
        period: 'weekly',
        page: 1,
        limit: 25,
      });
      expect(result.success).toBe(true);
    });

    it('rejects an invalid leaderboard type', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid period', () => {
      const result = listLeaderboardsSchema.safeParse({ type: 'all-time', period: 'daily' });
      expect(result.success).toBe(false);
    });
  });

  describe('summarizeThreadSchema', () => {
    it('accepts a valid UUID post id', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a custom max_length', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
        max_length: 500,
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-UUID post id', () => {
      const result = summarizeThreadSchema.safeParse({ post_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('rejects max_length below the minimum', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
        max_length: 10,
      });
      expect(result.success).toBe(false);
    });

    it('rejects max_length above the maximum', () => {
      const result = summarizeThreadSchema.safeParse({
        post_id: '550e8400-e29b-41d4-a716-446655440000',
        max_length: 5000,
      });
      expect(result.success).toBe(false);
    });
  });
});
