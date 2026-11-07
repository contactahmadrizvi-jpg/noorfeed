/**
 * Upstash Redis client — server-only singleton.
 * Uses the REST API so it works in Edge Runtime and Node.js alike.
 * Never import in client components.
 */
import { Redis } from "@upstash/redis";

// Lazily initialise so missing env vars don't crash the dev server
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in .env.local"
    );
  }

  _redis = new Redis({
    url,
    token,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(500),
  });
  return _redis;
}

// ── Cache-aside helpers ───────────────────────────────────────────────────────

const localCache = new Map<string, { value: unknown; expires: number }>();
const pending = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Generic cache-aside: try Redis first, on miss run `fetcher`, cache result.
 * Fetches directly if Redis is unavailable or exceeds its request deadline.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL
): Promise<T> {
  const cached = localCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const request = fetchCached(key, fetcher, ttlSeconds).then((value) => {
    if (pending.get(key) !== request) return value;
    if (localCache.size >= 100) localCache.delete(localCache.keys().next().value!);
    localCache.set(key, { value, expires: Date.now() + Math.min(ttlSeconds, 300) * 1000 });
    return value;
  }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
  pending.set(key, request);
  return request;
}

async function fetchCached<T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number): Promise<T> {
  let redis: Redis;
  try {
    redis = getRedis();
  } catch {
    // Redis not configured — skip cache
    return fetcher();
  }

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null) return cached;
  } catch {
    // Redis read failed — fall through to Firestore
  }

  const data = await fetcher();

  try {
    await redis.set(key, data, { ex: ttlSeconds });
  } catch {
    // Redis write failed — non-critical
  }

  return data;
}

/** Invalidate one or more cache keys */
export async function invalidateCache(...keys: string[]): Promise<void> {
  keys.forEach((key) => { localCache.delete(key); pending.delete(key); });
  try {
    const redis = getRedis();
    await Promise.all(keys.map((k) => redis.del(k)));
  } catch {
    // Silently fail
  }
}

// ── Cache key factories ───────────────────────────────────────────────────────
export const CacheKeys = {
  feed:        (page: number)  => `feed:page:${page}`,
  post:        (id: string)    => `post:${id}`,
  userProfile: (uid: string)   => `user:${uid}`,
  userPosts:   (uid: string)   => `user:${uid}:posts`,
} as const;
