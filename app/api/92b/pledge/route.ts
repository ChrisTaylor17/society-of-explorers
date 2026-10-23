// Backup/intent-only route. Real payments go through /api/92b/checkout -> Stripe.
import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PLEDGE_AMOUNT = 120000;

type PledgeIntentBody = {
  tier?: unknown;
  amount?: unknown;
  name?: unknown;
  email?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<PledgeIntentBody | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase().slice(0, 254);
  return EMAIL_PATTERN.test(email) ? email : '';
}

function normalizeAmount(value: unknown) {
  const numericValue =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? '').replaceAll(',', ''), 10);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(Math.trunc(numericValue), MAX_PLEDGE_AMOUNT));
}

function capitalLeadEmailNotificationsEnabled() {
  return process.env.CAPITAL_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendPledgeIntentNotification(input: {
  tier: string;
  amount: number;
  name: string;
  email: string;
}) {
  if (!capitalLeadEmailNotificationsEnabled()) return;

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: `92B Pledge: ${input.name} - ${input.tier} ($${input.amount})`,
      html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
        <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">92B SALON PLEDGE</div>
        <p><strong style="color:#c9a84c;">Name:</strong> ${escapeHtml(input.name)}</p>
        <p><strong style="color:#c9a84c;">Email:</strong> ${escapeHtml(input.email)}</p>
        <p><strong style="color:#c9a84c;">Tier:</strong> ${escapeHtml(input.tier)}</p>
        <p><strong style="color:#c9a84c;">Amount:</strong> $${input.amount.toLocaleString()}</p>
        <p style="color:#6a6050;font-size:12px;margin-top:20px;">${new Date().toISOString()}</p>
      </div>`,
    });
  } catch {
    console.warn('[92b/pledge] notification email skipped');
  }
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  const tier = boundedText(body.tier, 80) || 'unspecified';
  const amount = normalizeAmount(body.amount);
  const name = boundedText(body.name, 120);
  const email = normalizeEmail(body.email);

  if (!name || !email) {
    return privateJson({ error: 'Name and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: `[92B Pledge] ${tier} - $${amount}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[92b/pledge] founding interest insert failed');
    return privateJson({ error: 'Failed to record pledge intent' }, { status: 500 });
  }

  await sendPledgeIntentNotification({ tier, amount, name, email });

  return privateJson({ success: true });
}
