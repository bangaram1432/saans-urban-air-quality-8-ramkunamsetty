/**
 * Fixed-window in-memory rate limiter. Best-effort protection per serverless
 * instance (documented limitation); the clock is injectable for tests.
 */
export function createRateLimiter({ limit = 30, windowMs = 60_000, now = Date.now, maxKeys = 5000 } = {}) {
  const hits = new Map();

  function prune(t) {
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
    if (hits.size >= maxKeys) hits.clear(); // hard cap: memory stays bounded under abuse
  }

  return {
    check(key) {
      const t = now();
      if (hits.size >= maxKeys) prune(t);
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      const allowed = entry.count <= limit;
      return { allowed, retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
    },
  };
}
