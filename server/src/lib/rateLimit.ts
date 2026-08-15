import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Minimal in-memory, fixed-window rate limiter keyed by request IP. Not distributed —
 * fine for a single-process deployment guarding auth endpoints. Deliberately dependency-free.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (entry.count >= options.max) {
      res.status(429).json({ error: 'Too many requests, please try again later' });
      return;
    }

    entry.count += 1;
    next();
  };
}
