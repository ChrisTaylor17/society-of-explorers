import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTEREST_TYPES = new Set(['pledge', 'submit', 'both']);

type ProjectInterestBody = {
  name?: unknown;
  email?: unknown;
  interest_type?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<ProjectInterestBody | null> {
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

function normalizeInterestType(value: unknown) {
  const interestType = boundedText(value, 40).toLowerCase();
  return INTEREST_TYPES.has(interestType) ? interestType : 'both';
}

function projectLeadEmailNotificationsEnabled() {
  return process.env.PROJECT_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendProjectInterestNotification(input: { name: string; email: string; interestType: string }) {
  if (!projectLeadEmailNotificationsEnabled()) return;

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: `Projects Interest: ${input.name} (${input.interestType})`,
      html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
        <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">PROJECTS WAITLIST</div>
        <p><strong style="color:#c9a84c;">Name:</strong> ${escapeHtml(input.name)}</p>
        <p><strong style="color:#c9a84c;">Email:</strong> ${escapeHtml(input.email)}</p>
        <p><strong style="color:#c9a84c;">Interest:</strong> ${escapeHtml(input.interestType)}</p>
        <p style="color:#6a6050;font-size:12px;margin-top:20px;">${new Date().toISOString()}</p>
      </div>`,
    });
  } catch {
    console.warn('[projects/interest] notification email skipped');
  }
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);

  if (!body) {
    return privateJson({ error: 'Invalid body' }, { status: 400 });
  }

  const name = boundedText(body.name, 120);
  const email = normalizeEmail(body.email);
  const interestType = normalizeInterestType(body.interest_type);

  if (!name || !email) {
    return privateJson({ error: 'Name and email required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('founding_interest').insert({
    name,
    email,
    why: `[Projects Waitlist] ${interestType}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[projects/interest] founding interest insert failed');
    return privateJson({ error: 'Failed to record interest' }, { status: 500 });
  }

  await sendProjectInterestNotification({ name, email, interestType });

  return privateJson({ success: true });
}
