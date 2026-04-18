import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Basic but strict-enough email regex: local@domain.tld
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Duplicate-signup guard: if we've already recorded this email for the
  // waitlist in founding_interest, short-circuit before sending anything.
  const { data: existing } = await supabase
    .from('founding_interest')
    .select('id')
    .eq('email', normalized)
    .ilike('why', '%Council Waitlist%')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  // Record the signup so subsequent posts dedupe
  await supabase.from('founding_interest').insert({
    name: null,
    email: normalized,
    why: '[Council Waitlist]',
    created_at: new Date().toISOString(),
  });

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ success: true, note: 'No RESEND_API_KEY' });
  }

  const confirmHtml = `<!DOCTYPE html>
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

  try {
    // Send confirmation to subscriber
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: normalized,
        subject: "You're on the list — welcome to the Renaissance",
        html: confirmHtml,
      }),
    });

    // Notify Chris
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: 'chris@societyofexplorers.com',
        subject: `[Council Waitlist] ${normalized}`,
        html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;"><p style="color:#c9a84c;">[Council Waitlist]</p><p>${normalized}</p></div>`,
      }),
    });
  } catch (err) {
    console.error('Council waitlist email error:', err);
  }

  return NextResponse.json({ success: true });
}
