import type { MiddlewareHandler } from "hono";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}

/**
 * Fixed-window limiter shared across all callers of the route it's mounted
 * on (not per-IP: this tool has no auth and sits behind Tailscale, where a
 * NAT'd or proxied client can't be reliably attributed to one address
 * anyway). It's a backstop against a runaway client/script, not per-user
 * fairness — the limit is set well above normal human swipe-review pace.
 */
export function createRateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const now = options.now ?? Date.now;
  let windowStart = now();
  let count = 0;

  return async (c, next) => {
    const current = now();
    if (current - windowStart >= options.windowMs) {
      windowStart = current;
      count = 0;
    }
    count += 1;
    if (count > options.max) {
      return c.text("Too many requests", 429);
    }
    await next();
  };
}
