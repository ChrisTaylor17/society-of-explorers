import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { city, name, email, why } = await req.json();
  if (!city || !name || !email) return NextResponse.json({ error: 'City, name, and email required' }, { status: 400 });

  const { error } = await supabase.from('founding_interest').insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    why: `[Salon Proposal] ${city.trim()}${why ? ': ' + why.trim() : ''}`,
    created_at: new Date().toISOString(),
  });

  if (error) console.error('Salon proposal error:', error);

  if (process.env.RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: 'chris@societyofexplorers.com',
        subject: `Salon Proposal: ${city.trim()} — ${name.trim()}`,
        html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
          <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">SALON CITY PROPOSAL</div>
          <p><strong style="color:#c9a84c;">City:</strong> ${city.trim()}</p>
          <p><strong style="color:#c9a84c;">Name:</strong> ${name.trim()}</p>
          <p><strong style="color:#c9a84c;">Email:</strong> ${email.trim()}</p>
          ${why ? `<p><strong style="color:#c9a84c;">Why:</strong> ${why.trim()}</p>` : ''}
        </div>`,
      }),
    }).catch(err => console.error('Salon proposal email failed:', err));
  }

  return NextResponse.json({ success: true });
}
