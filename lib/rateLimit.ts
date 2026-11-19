// lib/rateLimit.ts
// Security fix S4: server-side rate limits for paid model calls.
//
// /api/thinker's anonymous demo mode was limited only by the client-supplied message
// count, and signed-in calls were not limited at all, so a script could run unlimited
// model calls on our key. This is a simple
// fixed-window limiter keyed by member id (signed-in) or client IP (anonymous).
//
// Limitation: state is in memory, so each serverless instance keeps its own counts
// and a cold start resets them. It bounds abuse per instance; a shared store
// (Upstash/Redis, Vercel KV or a Supabase table) is needed for a hard global cap.

export const LIMITS = {
  // A full council question fans out to up to 6 thinker calls.
  anonymous: { max: 30, windowMs: 10 * 60 * 1000 },
  member: { max: 120, windowMs: 10 * 60 * 1000 },
  // Ceiling across all anonymous callers on one instance (spoofed/rotating IPs).
  globalAnonymous: { max: 600, windowMs: 10 * 60 * 1000 },
} as const;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000;

export function rateLimit(key: string, max: number, windowMs: number, nowMs: number = Date.now()): { ok: boolean; retryAfterS: number } {
  let b = buckets.get(key);
  if (!b || b.resetAt <= nowMs) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= nowMs) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    b = { count: 0, resetAt: nowMs + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= max) {
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((b.resetAt - nowMs) / 1000)) };
  }
  b.count++;
  return { ok: true, retryAfterS: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

/** Client IP: first x-forwarded-for entry (set by Vercel's edge), else x-real-ip. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Applies the member or anonymous budget. Returns a 429 Response, or null if allowed. */
export function limitModelCall(req: { headers: { get(name: string): string | null } }, memberId: string | null, scope = 'thinker'): Response | null {
  let r: { ok: boolean; retryAfterS: number };
  if (memberId) {
    r = rateLimit(`${scope}:m:${memberId}`, LIMITS.member.max, LIMITS.member.windowMs);
  } else {
    r = rateLimit(`${scope}:ip:${clientIp(req)}`, LIMITS.anonymous.max, LIMITS.anonymous.windowMs);
    if (r.ok) {
      const g = rateLimit(`${scope}:anon-global`, LIMITS.globalAnonymous.max, LIMITS.globalAnonymous.windowMs);
      if (!g.ok) r = g;
    }
  }
  if (r.ok) return null;
  return new Response(JSON.stringify({ error: 'Too many requests, please slow down' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(r.retryAfterS),
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
