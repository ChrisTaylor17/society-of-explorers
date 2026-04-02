import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { recipientId, senderName, preview } = await req.json();

    if (!recipientId || !senderName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Look up recipient's email via their Supabase auth account
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('supabase_auth_id, display_name')
      .eq('id', recipientId)
      .single();

    if (!member?.supabase_auth_id) {
      return NextResponse.json({ sent: false, reason: 'no_email' });
    }

    // Get email from auth.users
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(member.supabase_auth_id);
    const email = authUser?.user?.email;

    if (!email) {
      return NextResponse.json({ sent: false, reason: 'no_email' });
    }

    const recipientName = member.display_name && !member.display_name.startsWith('0x')
      ? member.display_name
      : 'Explorer';

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('RESEND_API_KEY not set');
      return NextResponse.json({ sent: false, reason: 'no_api_key' });
    }

    const messagePreview = preview
      ? preview.substring(0, 120) + (preview.length > 120 ? '...' : '')
      : '';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Society of Explorers <onboarding@resend.dev>',
        to: email,
        subject: `${senderName} sent you a message`,
        html: `
          <div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;margin:0 auto;">
            <div style="font-size:10px;letter-spacing:0.3em;color:#c9a84c;opacity:0.5;margin-bottom:24px;font-family:serif;">
              SOCIETY OF EXPLORERS
            </div>

            <p style="font-size:18px;color:#f5f0e8;margin-bottom:8px;">
              ${recipientName},
            </p>

            <p style="font-size:16px;color:#d4c9a8;line-height:1.7;margin-bottom:24px;">
              <strong style="color:#c9a84c;">${senderName}</strong> sent you a message in the Society.
            </p>

            ${messagePreview ? `
            <div style="border-left:2px solid #c9a84c33;padding:12px 16px;margin-bottom:24px;color:#9a8f7a;font-style:italic;font-size:15px;line-height:1.6;">
              "${messagePreview}"
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
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return NextResponse.json({ sent: false, reason: 'resend_error' });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('DM notification error:', err);
    return NextResponse.json({ sent: false, reason: 'server_error' });
  }
}
