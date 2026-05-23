/**
 * Module: Rate Limiter
 * Purpose: In-memory sliding-window rate limiter for API route protection
 * Used by: src/app/api/auth/login/route.ts, src/app/api/ai/insights/route.ts
 * Dependencies: None (pure in-memory, no external deps)
 * Public functions: checkRateLimit(), checkHourlyRateLimit(), resetRateLimit()
 * Side effects: Maintains module-level Map<string, Attempt> in memory; runs cleanup interval
 */

interface Attempt {
  count: number;
  resetAt: number;
}

const store = new Map<string, Attempt>();

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000 // 15 menit
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string) {
  store.delete(key);
}

/**
 * Convenience hourly rate limiter — returns true if the request is allowed, false if rate limited.
 * Uses a 1-hour fixed window per namespace.
 * Designed for AI insight endpoints: checkHourlyRateLimit(`ai-insight:${userId}`, 30)
 */
export function checkHourlyRateLimit(namespace: string, maxPerHour: number): boolean {
  const HOUR_MS = 60 * 60 * 1000;
  const result = checkRateLimit(namespace, maxPerHour, HOUR_MS);
  return result.allowed;
}

// Bersihkan entry kadaluarsa setiap 10 menit (mencegah memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 10 * 60 * 1000);
