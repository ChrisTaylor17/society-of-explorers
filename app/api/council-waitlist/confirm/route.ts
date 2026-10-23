import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Basic but strict-enough email regex: local@domain.tld
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  if (email.length > 254) return '';
  return EMAIL_RE.test(email) ? email : '';
}

function councilWaitlistEmailNotificationsEnabled() {
  return process.env.COUNCIL_WAITLIST_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildConfirmationHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 0 32px;text-align:center;">
          <span style="font-family:Georgia,serif;font-size:9px;letter-spacing:0.4em;color:#c9a84c;">SOCIETY OF EXPLORERS</span>
        </td></tr>
        <tr><td style="padding:0 0 32px;"><div style="height:1px;background:rgba(201,168,76,0.2);"></div></td></tr>
        <tr><td style="padding:0 0 24px;text-align:center;">
          <p style="font-family:Georgia,serif;font-size:22px;line-height:1.6;color:#f5f0e8;margin:0;">Welcome to the Council Mode waitlist.</p>
        </td></tr>
        <tr><td style="padding:0 24px 24px;text-align:center;">
          <p style="font-family:Georgia,serif;font-size:16px;line-height:1.8;color:rgba(245,240,232,0.8);margin:0 0 16px;">
            You'll be among the first to consult Socrates, Nietzsche, Aurelius, Einstein, Plato, and Jobs &mdash; simultaneously.
          </p>
          <p style="font-family:Georgia,serif;font-size:16px;line-height:1.8;color:rgba(245,240,232,0.8);margin:0 0 16px;">
            The thinkers remember you. Every conversation deepens the relationship.
          </p>
          <p style="font-family:Georgia,serif;font-size:16px;line-height:1.8;color:rgba(245,240,232,0.8);margin:0;">
            We'll notify you the moment Council Mode goes live.
          </p>
        </td></tr>
        <tr><td style="padding:16px 0 24px;"><div style="height:1px;background:rgba(201,168,76,0.15);"></div></td></tr>
        <tr><td style="text-align:center;padding:0 0 8px;">
          <a href="https://www.societyofexplorers.com" style="font-family:Georgia,serif;font-size:12px;color:#c9a84c;text-decoration:none;">societyofexplorers.com</a>
        </td></tr>
        <tr><td style="text-align:center;">
          <span style="font-family:Georgia,serif;font-size:11px;color:rgba(245,240,232,0.3);">92B South St &middot; Boston</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendCouncilWaitlistEmails(email: string) {
  if (!councilWaitlistEmailNotificationsEnabled()) return;

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: email,
      subject: "You're on the list - welcome to the Renaissance",
      html: buildConfirmationHtml(),
    });

    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: `[Council Waitlist] ${email}`,
      html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;"><p style="color:#c9a84c;">[Council Waitlist]</p><p>${escapeHtml(
        email,
      )}</p></div>`,
    });
  } catch {
    console.warn('[council-waitlist/confirm] notification email skipped');
  }
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  if (typeof body.email !== 'string' || !body.email.trim()) {
    return privateJson({ error: 'Email required' }, { status: 400 });
  }

  const normalized = normalizeEmail(body.email);
  if (!normalized) {
    return privateJson({ error: 'Invalid email' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from('founding_interest')
    .select('id')
    .eq('email', normalized)
    .ilike('why', '%Council Waitlist%')
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.warn('[council-waitlist/confirm] duplicate lookup failed');
    return privateJson({ error: 'Failed to record waitlist signup' }, { status: 500 });
  }

  if (existing) {
    return privateJson({ success: true, duplicate: true });
  }

  const { error: insertError } = await supabase.from('founding_interest').insert({
    name: null,
    email: normalized,
    why: '[Council Waitlist]',
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    console.warn('[council-waitlist/confirm] waitlist insert failed');
    return privateJson({ error: 'Failed to record waitlist signup' }, { status: 500 });
  }

  await sendCouncilWaitlistEmails(normalized);

  return privateJson({ success: true });
}
