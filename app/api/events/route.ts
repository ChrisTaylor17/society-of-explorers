import { NextRequest } from 'next/server';
import { isAnalyticsEvent, sanitizeProps } from '@/lib/analytics/events';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { deploymentEnvironment } from '@/lib/payments/stripeMode';

export const runtime = 'nodejs';

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' };
const MAX_BODY_BYTES = 2048;

function reply(status: number, body: Record<string, unknown> = { ok: status < 300 }) {
  return Response.json(body, { status, headers: HEADERS });
}

// Records an allowlisted funnel event as one structured log line (visible in Vercel
// runtime logs, filter "[soe-event]"). Nothing is stored and no personal data is kept:
// no IP, no cookie, no email, no free text.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`events:ip:${clientIp(req)}`, 60, 60_000);
  if (!limited.ok) return reply(429, { ok: false });

  let raw = '';
  try {
    raw = await req.text();
  } catch {
    return reply(400, { ok: false });
  }
  if (!raw || raw.length > MAX_BODY_BYTES) return reply(400, { ok: false });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { ok: false });

  const { event, props } = body as { event?: unknown; props?: unknown };
  if (!isAnalyticsEvent(event)) return reply(400, { ok: false });

  console.log('[soe-event]', JSON.stringify({ event, props: sanitizeProps(props), env: deploymentEnvironment(), at: new Date().toISOString() }));
  return reply(202, { ok: true });
}

export function GET() {
  return reply(405, { ok: false });
}
