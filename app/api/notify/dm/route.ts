import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

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

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function dmEmailNotificationsEnabled() {
  return process.env.DM_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function subjectText(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
}

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await safeRequestJson(req);

    if (!body) {
      return privateJson({ error: 'Invalid body' }, { status: 400 });
    }

    const recipientId = boundedText(body.recipientId, 128);
    const senderName = boundedText(body.senderName, 120);
    const rawPreview = boundedText(body.preview, 500);
    const preview = rawPreview.slice(0, 120);

    if (!recipientId || !senderName) {
      return privateJson({ error: 'Missing fields' }, { status: 400 });
    }

    if (!dmEmailNotificationsEnabled()) {
      return privateJson({ sent: false, reason: 'email_disabled' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResend();

    // Look up recipient's email via their Supabase auth account
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('supabase_auth_id, display_name')
      .eq('id', recipientId)
      .single();

    if (memberError) {
      console.warn('[notify/dm] recipient lookup failed');
      return privateJson({ sent: false, reason: 'recipient_lookup_failed' });
    }

    if (!member?.supabase_auth_id) {
      return privateJson({ sent: false, reason: 'no_email' });
    }

    // Get email from auth.users
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(member.supabase_auth_id);
    const email = authUser?.user?.email;

    if (!email) {
      return privateJson({ sent: false, reason: 'no_email' });
    }

    const recipientName = member.display_name && !member.display_name.startsWith('0x')
      ? member.display_name
      : 'Explorer';

    const messagePreview = preview ? `${preview}${rawPreview.length > preview.length ? '...' : ''}` : '';
    const safeRecipientName = escapeHtml(recipientName);
    const safeSenderName = escapeHtml(senderName);
    const safeMessagePreview = escapeHtml(messagePreview);
    const safeSubjectSenderName = subjectText(senderName);

    const { error: resendError } = await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: email,
      subject: `${safeSubjectSenderName} sent you a message`,
      html: `
        <div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;margin:0 auto;">
          <div style="font-size:10px;letter-spacing:0.3em;color:#c9a84c;opacity:0.5;margin-bottom:24px;font-family:serif;">
            SOCIETY OF EXPLORERS
          </div>

          <p style="font-size:18px;color:#f5f0e8;margin-bottom:8px;">
            ${safeRecipientName},
          </p>

          <p style="font-size:16px;color:#d4c9a8;line-height:1.7;margin-bottom:24px;">
            <strong style="color:#c9a84c;">${safeSenderName}</strong> sent you a message in the Society.
          </p>

          ${safeMessagePreview ? `
          <div style="border-left:2px solid #c9a84c33;padding:12px 16px;margin-bottom:24px;color:#9a8f7a;font-style:italic;font-size:15px;line-height:1.6;">
            "${safeMessagePreview}"
          </div>
          ` : ''}

          <a href="https://www.societyofexplorers.com/members"
             style="display:inline-block;background:#c9a84c;color:#000;padding:12px 28px;text-decoration:none;font-size:11px;letter-spacing:0.2em;font-family:serif;">
            OPEN THE SALON
          </a>

          <div style="margin-top:32px;border-top:1px solid #c9a84c22;padding-top:16px;font-size:11px;color:#5a5040;">
            92B South St · Downtown Boston · societyofexplorers.com
          </div>
        </div>
      `,
    });

    if (resendError) {
      console.warn('[notify/dm] resend send failed');
      return privateJson({ sent: false, reason: 'resend_error' });
    }

    return privateJson({ sent: true });
  } catch {
    console.warn('[notify/dm] notification failed');
    return privateJson({ sent: false, reason: 'server_error' });
  }
}
