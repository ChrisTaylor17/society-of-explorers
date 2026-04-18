import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MEMBER_SELECT = 'id, display_name, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens, supabase_auth_id';

interface OnboardingStep {
  day: number;
  thinkerId: string;
  thinkerName: string;
  subject: string;
  buildPrompt: (profile: string) => string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    day: 1,
    thinkerId: 'socrates',
    thinkerName: 'Socrates',
    subject: 'Socrates has a question for you',
    buildPrompt: (profile) => `You are Socrates, welcoming a new founding member to the Society of Explorers.

This person just committed $499 to join. They believe in this enough to be here at the beginning. Honor that.

THEIR PROFILE:
${profile}

Write a short, warm welcome (4-6 sentences) that:
1. Acknowledges what they're building and why it matters
2. Asks ONE sharp question about their stated philosophy or project — the kind of question that makes them think for days
3. Ends with an invitation to come to the Salon and continue the conversation

Be warm, direct, modern. No archaic language. This is the first thing they read as a member — make it land.`
  },
  {
    day: 3,
    thinkerId: 'einstein',
    thinkerName: 'Einstein',
    subject: 'Einstein noticed something about your project',
    buildPrompt: (profile) => `You are Einstein, reaching out to a new Society of Explorers member on their third day.

THEIR PROFILE:
${profile}

Write a short insight (3-5 sentences) that:
1. Reframes something about their project or discipline from a non-obvious angle
2. Connects their work to a broader pattern they might not have seen
3. Proposes one small experiment they could try this week

Be curious, playful, specific to them. Make them feel seen by a brilliant mind.`
  },
  {
    day: 5,
    thinkerId: 'nietzsche',
    thinkerName: 'Nietzsche',
    subject: 'Nietzsche challenges you',
    buildPrompt: (profile) => `You are Nietzsche, challenging a Society of Explorers member on their fifth day.

THEIR PROFILE:
${profile}

Write a short provocation (3-5 sentences) that:
1. Names the bold version of what they're doing — the version they might be afraid to commit to
2. Contrasts it with the safe version they might be defaulting to
3. Ends with a direct challenge: what will they have done by next week?

Be intense but respectful. Provoke toward creation, not paralysis.`
  },
  {
    day: 7,
    thinkerId: 'aurelius',
    thinkerName: 'Marcus Aurelius',
    subject: 'Your first week — one thing matters',
    buildPrompt: (profile) => `You are Marcus Aurelius, closing a new member's first week at the Society of Explorers.

THEIR PROFILE:
${profile}

Write a short reflection (3-5 sentences) that:
1. Names the single most important thing they should focus on this week based on their profile
2. Names one thing they should consciously let go of
3. Delivers one Stoic principle — in modern language — that applies to their specific situation

Be steady, grounded, warm. Every word should earn its place.`
  }
];

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { memberId, step } = await req.json();

    if (!memberId || step === undefined) {
      return NextResponse.json({ error: 'memberId and step required' }, { status: 400 });
    }

    const onboardingStep = ONBOARDING_STEPS[step];
    if (!onboardingStep) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    const { data: member } = await supabaseAdmin
      .from('members')
      .select(MEMBER_SELECT)
      .eq('id', memberId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Get member email
    let email: string | null = null;
    if (member.supabase_auth_id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(member.supabase_auth_id);
      email = authUser?.user?.email || null;
    }

    const memberName = member.display_name && !member.display_name.startsWith('0x')
      ? member.display_name : 'Explorer';

    const profile = [
      `Name: ${memberName}`,
      member.bio ? `Bio: ${member.bio}` : null,
      member.discipline ? `Discipline: ${member.discipline}` : null,
      member.skills?.length ? `Skills: ${member.skills.join(', ')}` : null,
      member.project_description ? `Building: ${member.project_description}` : null,
      member.seeking ? `Seeking: ${member.seeking}` : null,
      member.philosophy ? `Philosophy: ${member.philosophy}` : null,
    ].filter(Boolean).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: onboardingStep.buildPrompt(profile),
      messages: [{ role: 'user', content: `Write the Day ${onboardingStep.day} message for this member.` }],
    });

    const messageText = response.content.find(b => b.type === 'text')?.text || '';

    // Save to private salon
    await supabaseAdmin.from('salon_messages').insert({
      salon_id: `private-${memberId}`,
      member_id: null,
      thinker_id: onboardingStep.thinkerId,
      content: messageText,
      message_type: 'thinker',
    });

    // Send email if available
    if (email && process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Society of Explorers <notifications@societyofexplorers.com>',
          to: email,
          subject: onboardingStep.subject,
          html: `
            <div style="background:#000;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;margin:0 auto;">
              <div style="font-size:10px;letter-spacing:0.3em;color:#c9a84c;opacity:0.5;margin-bottom:24px;">
                SOCIETY OF EXPLORERS · DAY ${onboardingStep.day}
              </div>
              <p style="font-size:16px;color:#d4c9a8;line-height:1.8;margin-bottom:24px;">
                ${messageText.replace(/\n/g, '<br/>').replace(/\*\*(.+?)\*\*/g, '<strong style="color:#c9a84c">$1</strong>')}
              </p>
              <div style="margin-top:8px;font-size:11px;color:#6a6050;font-style:italic;margin-bottom:24px;">
                — ${onboardingStep.thinkerName}, Society of Explorers
              </div>
              <a href="https://www.societyofexplorers.com/salon"
                 style="display:inline-block;background:#c9a84c;color:#000;padding:12px 28px;text-decoration:none;font-size:11px;letter-spacing:0.2em;">
                ENTER THE SALON
              </a>
              <div style="margin-top:32px;border-top:1px solid #c9a84c22;padding-top:16px;font-size:11px;color:#5a5040;">
                92B South St · Downtown Boston
              </div>
            </div>
          `,
        }),
      });
    }

    // Record step (table may not exist yet)
    const { error: logError } = await supabaseAdmin.from('onboarding_log').insert({
      member_id: memberId,
      step: step,
      thinker_id: onboardingStep.thinkerId,
      sent_at: new Date().toISOString(),
    });
    if (logError) console.warn('onboarding_log insert skipped:', logError.message);

    return NextResponse.json({
      sent: true,
      step,
      thinker: onboardingStep.thinkerName,
      hasEmail: !!email,
    });
  } catch (err) {
    console.error('Onboarding error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
