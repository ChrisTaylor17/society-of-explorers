import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PublicLeadBody = Record<string, unknown>;

type LeadNotificationField = {
  label: string;
  value: string;
};

type LeadNotificationInput = {
  heading: string;
  subject: string;
  fields: LeadNotificationField[];
};

function isRecord(value: unknown): value is PublicLeadBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function safePublicLeadRequestJson(req: NextRequest): Promise<PublicLeadBody | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function boundedLeadText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function normalizeLeadEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase().slice(0, 254);
  return EMAIL_PATTERN.test(email) ? email : '';
}

export function publicLeadEmailNotificationsEnabled() {
  return process.env.PUBLIC_LEAD_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendPublicLeadNotification(input: LeadNotificationInput) {
  if (!publicLeadEmailNotificationsEnabled()) return;

  try {
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: 'chris@societyofexplorers.com',
      subject: input.subject,
      html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
        <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">${escapeHtml(
          input.heading,
        )}</div>
        ${input.fields
          .map(
            (field) =>
              `<p><strong style="color:#c9a84c;">${escapeHtml(field.label)}:</strong> ${escapeHtml(field.value)}</p>`,
          )
          .join('')}
        <p style="color:#6a6050;font-size:12px;margin-top:20px;">${new Date().toISOString()}</p>
      </div>`,
    });
  } catch {
    console.warn('[public-lead] notification email skipped');
  }
}
