/**
 * In-process, in-memory rate limiting - CLAUDE_CODE_BRIEF.md Phase 14 §22
 * flagged `/api/quote` as having no abuse protection at all. This is a
 * best-effort throttle, not a distributed one: each serverless instance
 * keeps its own counters, so a determined attacker spread across many
 * concurrent instances could exceed the nominal limit. That's an accepted
 * trade-off for a one-person shop's real traffic volume - it stops a casual
 * scripted flood without adding a paid external service (e.g. Upstash
 * Redis). Revisit if abuse is ever actually observed in production logs.
 */

interface Bucket {
  count: number;
  windowStartMs: number;
}

const buckets = new Map<string, Bucket>();

// Sweep old buckets periodically so this Map can't grow without bound over
// a long-lived process's lifetime.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweepIfDue(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartMs > windowMs) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Fixed-window counter: `key` may make up to `maxRequests` calls within any
 * `windowMs` window before being denied until the window resets.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepIfDue(now, windowMs);

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true };
  }

  if (existing.count < maxRequests) {
    existing.count += 1;
    return { allowed: true };
  }

  const retryAfterSeconds = Math.ceil((existing.windowStartMs + windowMs - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}

/**
 * Best-effort client identifier behind Vercel's proxy. `x-forwarded-for` can
 * be spoofed by the caller directly (this app isn't behind a second trusted
 * proxy that would strip a forged one), so this is a throttle key, not an
 * identity or security boundary.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
