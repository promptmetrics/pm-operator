import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? Redis.fromEnv() : null;

export type RateLimitTier =
  | 'anonymousPublicRead'
  | 'authenticatedWrite'
  | 'authEndpoint'
  | 'mcp'
  | 'mcpRead'
  | 'mentionAutocomplete'
  | 'follow'
  | 'message'
  | 'unfurl';

type RateLimitConfig = {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
  keyFn: (identifier: string) => string;
};

const TIER_CONFIG: Record<RateLimitTier, RateLimitConfig> = {
  anonymousPublicRead: {
    windowSeconds: 60,
    maxRequests: 60,
    keyPrefix: 'ratelimit:anon:read',
    keyFn: (ip: string) => `ratelimit:anon:read:${ip}`,
  },
  authenticatedWrite: {
    windowSeconds: 60,
    maxRequests: 30,
    keyPrefix: 'ratelimit:auth:write',
    keyFn: (userId: string) => `ratelimit:auth:write:${userId}`,
  },
  authEndpoint: {
    windowSeconds: 60,
    maxRequests: 10,
    keyPrefix: 'ratelimit:auth:endpoint',
    keyFn: (ip: string) => `ratelimit:auth:endpoint:${ip}`,
  },
  mcp: {
    windowSeconds: 60,
    maxRequests: 100,
    keyPrefix: 'ratelimit:mcp',
    keyFn: (clientId: string) => `ratelimit:mcp:${clientId}`,
  },
  mcpRead: {
    windowSeconds: 60,
    maxRequests: 100,
    keyPrefix: 'ratelimit:mcp:read',
    keyFn: (clientId: string) => `ratelimit:mcp:read:${clientId}`,
  },
  mentionAutocomplete: {
    windowSeconds: 60,
    maxRequests: 30,
    keyPrefix: 'ratelimit:mention',
    keyFn: (userId: string) => `ratelimit:mention:${userId}`,
  },
  follow: {
    windowSeconds: 60,
    maxRequests: 20,
    keyPrefix: 'ratelimit:follow',
    keyFn: (userId: string) => `ratelimit:follow:${userId}`,
  },
  message: {
    windowSeconds: 60,
    maxRequests: 30,
    keyPrefix: 'ratelimit:message',
    keyFn: (userId: string) => `ratelimit:message:${userId}`,
  },
  // Composer link-preview endpoint (track 2A). Cosmetic — the server
  // re-fetches on save — so keep it tight.
  unfurl: {
    windowSeconds: 60,
    maxRequests: 10,
    keyPrefix: 'ratelimit:unfurl',
    keyFn: (userId: string) => `ratelimit:unfurl:${userId}`,
  },
};

export async function checkRateLimit(
  tier: RateLimitTier,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const config = TIER_CONFIG[tier];
  const key = config.keyFn(identifier);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / config.windowSeconds) * config.windowSeconds;
  const windowKey = `${key}:${windowStart}`;

  if (!redis) {
    return { success: true, limit: config.maxRequests, remaining: config.maxRequests, reset: windowStart + config.windowSeconds };
  }

  try {
    const current = await redis.incr(windowKey);
    if (current === 1) {
      await redis.expire(windowKey, config.windowSeconds);
    }

    const remaining = Math.max(0, config.maxRequests - current);
    const reset = windowStart + config.windowSeconds;

    return {
      success: current <= config.maxRequests,
      limit: config.maxRequests,
      remaining,
      reset,
    };
  } catch {
    // If Redis is misconfigured or unreachable, fail open so requests are not blocked.
    return { success: true, limit: config.maxRequests, remaining: config.maxRequests, reset: windowStart + config.windowSeconds };
  }
}
