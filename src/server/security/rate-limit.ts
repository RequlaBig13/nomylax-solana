/**
 * Fixed window rate limiter.
 *
 * In memory, which is correct for a single Vercel instance and honest about
 * its limit: a serverless fleet gets per instance counting. SECURITY.md records
 * this. Swap the Map for Upstash Redis when traffic justifies it.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, retryAfter: 0 };
  }

  existing.count += 1;
  const ok = existing.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfter: ok ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Called by tests and by a periodic sweep to stop unbounded growth. */
export function sweepRateLimits(now = Date.now()) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function resetRateLimits() {
  buckets.clear();
}

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}
