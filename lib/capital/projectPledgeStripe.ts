import { resolveStripeSecretKey, type StripeMode } from '@/lib/payments/stripeMode';

// Project pledges were unreachable until the project-id pattern was fixed (2026-10-24).
// Fixing it must not silently start taking live money: live-mode pledges stay off until
// PROJECT_PLEDGES_LIVE_ENABLED=true is set deliberately. Test mode (preview/local) works.
export function projectPledgeStripe(env: Record<string, string | undefined> = process.env):
  | { ok: true; key: string; mode: StripeMode }
  | { ok: false; status: number; code: string; error: string } {
  const resolved = resolveStripeSecretKey(env);
  if (!resolved.ok) {
    return { ok: false, status: 503, code: 'pledges_unconfigured', error: 'Pledge checkout is not available here yet' };
  }
  if (resolved.mode === 'live' && env.PROJECT_PLEDGES_LIVE_ENABLED !== 'true') {
    return { ok: false, status: 503, code: 'pledges_not_live', error: 'Project pledges are not open yet' };
  }
  return { ok: true, key: resolved.key, mode: resolved.mode };
}
