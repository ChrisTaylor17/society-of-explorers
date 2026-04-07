import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { title, short_description, description, category, funding_goal, name, email } = await req.json();

  if (!title || !description || !name || !email) {
    return NextResponse.json({ error: 'Title, description, name, and email are required' }, { status: 400 });
  }

  const { error } = await supabase.from('projects').insert({
    title: title.trim(),
    short_description: short_description?.trim() || null,
    description: description.trim(),
    category: category || 'general',
    funding_goal: parseInt(funding_goal) || 10000,
    status: 'pending',
    proposer_name: name.trim(),
    proposer_email: email.trim().toLowerCase(),
  });

  if (error) {
    console.error('Project submit error:', error);
    return NextResponse.json({ error: 'Failed to submit project' }, { status: 500 });
  }

  if (process.env.RESEND_API_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: 'chris@societyofexplorers.com',
        subject: `New Project Submission: ${title.trim()}`,
        html: `<div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
          <div style="font-size:10px;letter-spacing:3px;color:#c9a84c;opacity:0.5;margin-bottom:20px;">PROJECT SUBMISSION</div>
          <p><strong style="color:#c9a84c;">Title:</strong> ${title.trim()}</p>
          <p><strong style="color:#c9a84c;">Category:</strong> ${category || 'general'}</p>
          <p><strong style="color:#c9a84c;">Goal:</strong> $${funding_goal || 10000}</p>
          <p><strong style="color:#c9a84c;">Name:</strong> ${name.trim()}</p>
          <p><strong style="color:#c9a84c;">Email:</strong> ${email.trim()}</p>
          <p><strong style="color:#c9a84c;">Description:</strong> ${description.trim().slice(0, 300)}</p>
        </div>`,
      }),
    }).catch(err => console.error('Project submit email failed:', err));
  }

  return NextResponse.json({ success: true });
}
