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

function headerValue(req: HttpRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function clientKey(req: HttpRequest): string {
  // Vercel overwrites x-vercel-forwarded-for with the original client IP.
  // For x-forwarded-for, the platform appends the trusted hop, so the last
  // value is safer than a client-controlled first value.
  const vercelForwarded = headerValue(req, 'x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercelForwarded) return vercelForwarded;
  const forwarded = headerValue(req, 'x-forwarded-for')?.split(',').map((item) => item.trim()).filter(Boolean);
  return forwarded?.at(-1) || headerValue(req, 'x-real-ip')?.trim() || 'unknown';
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
