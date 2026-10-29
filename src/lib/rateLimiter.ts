/**
 * Client-side rate limiter backed by localStorage.
 *
 * Each "action key" stores a list of timestamps. Before allowing an action,
 * we evict timestamps outside the window and check if the attempt count
 * exceeds the limit. On block, we return how many seconds are left.
 *
 * Note: this is a UX guard — server-side Firebase Security Rules are the
 * authoritative enforcement layer. This prevents accidental hammering and
 * gives meaningful feedback to the user.
 */

interface RateLimitConfig {
  /** Max attempts allowed within the window */
  maxAttempts: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest attempt expires (only set when blocked) */
  retryAfterSeconds?: number;
  /** How many attempts remain in the current window */
  remaining: number;
}

const PREFIX = "nf_rl_";

function getKey(action: string): string {
  return `${PREFIX}${action}`;
}

function loadTimestamps(action: string): number[] {
  try {
    const raw = localStorage.getItem(getKey(action));
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function saveTimestamps(action: string, timestamps: number[]): void {
  try {
    localStorage.setItem(getKey(action), JSON.stringify(timestamps));
  } catch {
    // localStorage full or unavailable — fail open (don't block the user)
  }
}

export function checkRateLimit(
  action: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Load and evict expired timestamps
  const timestamps = loadTimestamps(action).filter((t) => t > windowStart);

  const remaining = Math.max(0, config.maxAttempts - timestamps.length);

  if (timestamps.length >= config.maxAttempts) {
    // Oldest timestamp tells us when the block expires
    const oldestInWindow = Math.min(...timestamps);
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remaining: 0,
    };
  }

  // Record this attempt
  timestamps.push(now);
  saveTimestamps(action, timestamps);

  return { allowed: true, remaining: remaining - 1 };
}

export function resetRateLimit(action: string): void {
  try {
    localStorage.removeItem(getKey(action));
  } catch {
    // ignore
  }
}

// ── Pre-configured limiters used across the app ──────────────────────────────

/** 5 login attempts per 15 minutes */
export const loginLimit = (identifier: string) =>
  checkRateLimit(`login_${identifier}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });

/** 3 signup attempts per hour */
export const signupLimit = () =>
  checkRateLimit("signup", { maxAttempts: 3, windowMs: 60 * 60 * 1000 });

/** 3 password reset emails per hour */
export const resetLimit = (email: string) =>
  checkRateLimit(`reset_${email}`, { maxAttempts: 3, windowMs: 60 * 60 * 1000 });

/** 5 posts per hour per user */
export const postLimit = (uid: string) =>
  checkRateLimit(`post_${uid}`, { maxAttempts: 5, windowMs: 60 * 60 * 1000 });

/** 10 comments per 10 minutes per user */
export const commentLimit = (uid: string) =>
  checkRateLimit(`comment_${uid}`, { maxAttempts: 10, windowMs: 10 * 60 * 1000 });

/** Format seconds into a human-readable string */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m !== 1 ? "s" : ""}`;
}
