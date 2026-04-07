import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { name, email, interest_type } = await req.json();
  if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  const { error } = await supabase.from('founding_interest').insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    why: `[Projects Waitlist] ${interest_type || 'both'}`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('projects interest insert error:', error);
  }

  // Notify Chris
  if (process.env.RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: 'chris@societyofexplorers.com',
        subject: `Projects Interest: ${name.trim()} (${interest_type})`,
        html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
          <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">PROJECTS WAITLIST</div>
          <p><strong style="color:#c9a84c;">Name:</strong> ${name.trim()}</p>
          <p><strong style="color:#c9a84c;">Email:</strong> ${email.trim()}</p>
          <p><strong style="color:#c9a84c;">Interest:</strong> ${interest_type}</p>
          <p style="color:#6a6050;font-size:12px;margin-top:20px;">${new Date().toISOString()}</p>
        </div>`,
      }),
    }).catch(err => console.error('Projects interest email failed:', err));
  }

  return NextResponse.json({ success: true });
}
