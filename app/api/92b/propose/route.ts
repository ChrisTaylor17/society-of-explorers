import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SalonProposalBody = {
  city?: unknown;
  name?: unknown;
  email?: unknown;
  why?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<SalonProposalBody | null> {
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

async function sendSalonProposalNotification(input: {
  city: string;
  name: string;
  email: string;
  why: string;
}) {
  if (!capitalLeadEmailNotificationsEnabled()) return;

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: `Salon Proposal: ${input.city} - ${input.name}`,
      html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
        <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">SALON CITY PROPOSAL</div>
        <p><strong style="color:#c9a84c;">City:</strong> ${escapeHtml(input.city)}</p>
        <p><strong style="color:#c9a84c;">Name:</strong> ${escapeHtml(input.name)}</p>
        <p><strong style="color:#c9a84c;">Email:</strong> ${escapeHtml(input.email)}</p>
        ${input.why ? `<p><strong style="color:#c9a84c;">Why:</strong> ${escapeHtml(input.why)}</p>` : ''}
        <p style="color:#6a6050;font-size:12px;margin-top:20px;">${new Date().toISOString()}</p>
      </div>`,
    });
  } catch {
    console.warn('[92b/propose] notification email skipped');
  }
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  const city = boundedText(body.city, 120);
  const name = boundedText(body.name, 120);
  const email = normalizeEmail(body.email);
  const why = boundedText(body.why, 1000);

  if (!city || !name || !email) {
    return privateJson({ error: 'City, name, and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: `[Salon Proposal] ${city}${why ? `: ${why}` : ''}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[92b/propose] founding interest insert failed');
    return privateJson({ error: 'Failed to record salon proposal' }, { status: 500 });
  }

  await sendSalonProposalNotification({ city, name, email, why });

  return privateJson({ success: true });
}
