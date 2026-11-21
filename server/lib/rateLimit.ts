import type { HttpRequest, HttpResponse, NextFunction, RequestHandler } from './router.js';

interface RateLimitOptions {
  windowMs: number;
  limit: number;
  message: Record<string, unknown>;
}

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

function clientKey(req: HttpRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || req.headers['x-real-ip']?.toString() || 'unknown';
}

/**
 * Best-effort in-memory limiter. Vercel Functions scale across isolated
 * instances, so this is per-instance rather than globally distributed. The
 * 12/15-minute contract and response shape are preserved without adding a
 * separate hosting provider or cache dependency.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { windowMs, limit, message } = options;

  return (_req: HttpRequest, res: HttpResponse, next: NextFunction) => {
    const now = Date.now();
    const key = clientKey(_req);
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Policy', `${limit};w=${Math.ceil(windowMs / 1000)}`);

    if (bucket.hits.length >= limit) {
      const oldest = bucket.hits[0] ?? now;
      const resetSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(resetSeconds));
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json(message);
      buckets.set(key, bucket);
      return;
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.hits.length)));
    next();
  };
}
