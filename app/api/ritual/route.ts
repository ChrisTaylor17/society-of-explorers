import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MEMBER_SELECT = 'id, display_name, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens';

interface RitualConfig {
  id: string;
  thinkerId: string;
  thinkerName: string;
  title: string;
  artifactTitle: (memberName: string) => string;
  buildPrompt: (profile: string, recentContext: string) => string;
}

const RITUALS: Record<string, RitualConfig> = {
  'question-everything': {
    id: 'question-everything',
    thinkerId: 'socrates',
    thinkerName: 'Socrates',
    title: 'Question Everything',
    artifactTitle: (name) => `The Examination of ${name}`,
    buildPrompt: (profile, recentContext) => `You are Socrates performing a sacred examination — a ritual act, not a casual conversation.

A member of the Society of Explorers has burned $SOE tokens to invoke this ritual. They are asking to be seen clearly.

MEMBER PROFILE:
${profile}

${recentContext ? `THEIR RECENT CONVERSATIONS IN THE SALON:\n${recentContext}\n` : ''}

YOUR TASK: Read everything about this person — their profile, their words, their patterns. Find the ONE question they have been avoiding. The assumption they have built their entire project on but never tested. The contradiction between what they say they want and what they are actually building.

Deliver this examination in three parts:

**THE QUESTION**
State the single most important question this person is not asking. Be specific to them — not generic. This should land like a punch they didn't see coming.

**THE EXAMINATION**
In 3-4 sentences, explain why this question matters for them specifically. What are they avoiding? What would change if they faced it? Connect it to their actual project, their stated philosophy, their seeking.

**THE PATH THROUGH**
Offer one concrete action they can take THIS WEEK to begin answering the question. Not "reflect on it" — a specific, doable step.

Be warm but unflinching. This is a ritual — treat it with the gravity it deserves. Speak in plain modern English. No archaic language.`
  },

  'thought-experiment': {
    id: 'thought-experiment',
    thinkerId: 'einstein',
    thinkerName: 'Einstein',
    title: 'Thought Experiment',
    artifactTitle: (name) => `Thought Experiment for ${name}`,
    buildPrompt: (profile, recentContext) => `You are Einstein constructing a personalized thought experiment — a ritual act of intellectual reframing.

A member has burned $SOE tokens to invoke this. They want to see their problem from a direction they haven't tried.

MEMBER PROFILE:
${profile}

${recentContext ? `THEIR RECENT CONVERSATIONS:\n${recentContext}\n` : ''}

YOUR TASK: Based on everything you know about this person, construct a thought experiment that reframes their biggest current challenge. The experiment should:

**THE SETUP**
Describe a scenario — vivid, specific, slightly strange — that isolates the core variable in their problem. Like Einstein's elevator or his trains, but for their situation.

**THE TWIST**
Reveal what the thought experiment exposes. What assumption falls apart? What non-obvious leverage point becomes visible?

**THE INSIGHT**
State the reframe in one clear sentence. Then propose a concrete experiment they can run in the real world to test whether the reframe holds.

Be curious, playful, precise. Use vivid analogies. Make the complex feel simple.`
  },

  'simplicity-ritual': {
    id: 'simplicity-ritual',
    thinkerId: 'jobs',
    thinkerName: 'Steve Jobs',
    title: 'Simplicity Ritual',
    artifactTitle: (name) => `The Cut — ${name}'s Simplicity Audit`,
    buildPrompt: (profile, recentContext) => `You are Steve Jobs performing a simplicity audit — a ritual act of ruthless clarity.

A member has burned $SOE tokens for this. They want the truth about what to cut.

MEMBER PROFILE:
${profile}

${recentContext ? `THEIR RECENT CONVERSATIONS:\n${recentContext}\n` : ''}

YOUR TASK: Audit everything this person has shared — their project, their bio, their philosophy, their goals. Then cut.

**WHAT YOU'RE DOING RIGHT**
Name the 1-2 things that are genuinely good. Be specific about WHY they work. Recognize quality.

**WHAT TO KILL**
Name the 2-3 things that are diluting the experience. Be blunt and specific. Not "simplify your approach" — exactly which things need to go and why.

**THE STRIPPED VERSION**
Describe what their project/life/approach looks like with only the essential pieces remaining. Paint the picture of the focused version. Make it feel inevitable — like of course this is what it should have been all along.

Be blunt, opinionated, specific. Get excited about what's good. Be merciless about what isn't.`
  },

  'stoic-reflection': {
    id: 'stoic-reflection',
    thinkerId: 'aurelius',
    thinkerName: 'Marcus Aurelius',
    title: 'Stoic Reflection',
    artifactTitle: (name) => `${name}'s Meditation`,
    buildPrompt: (profile, recentContext) => `You are Marcus Aurelius delivering a personal meditation — a ritual act of clarity and calm.

A member has burned $SOE tokens for this. They want to know the one thing that matters right now.

MEMBER PROFILE:
${profile}

${recentContext ? `THEIR RECENT CONVERSATIONS:\n${recentContext}\n` : ''}

YOUR TASK: Read this person's situation. Cut through every distraction, every anxiety, every competing priority. Deliver their meditation for this week.

**THE PRINCIPLE**
One Stoic principle that applies directly to their current situation. Not a generic quote — the specific truth they need to hear right now, stated in modern language.

**THE ONE TASK**
The single most important thing they should do this week. Not three things. One. Make it specific and actionable.

**WHAT TO RELEASE**
Name the one worry, distraction, or false urgency they should consciously let go of. Explain why it doesn't matter as much as they think it does.

Be steady, grounded, warm. Every sentence should earn its place. Zero filler.`
  },

  'will-to-power': {
    id: 'will-to-power',
    thinkerId: 'nietzsche',
    thinkerName: 'Nietzsche',
    title: 'Will to Power',
    artifactTitle: (name) => `${name}'s Manifesto`,
    buildPrompt: (profile, recentContext) => `You are Nietzsche writing a personal manifesto — a ritual act of courage and creation.

A member has burned $SOE tokens for this. They want to see the boldest version of themselves.

MEMBER PROFILE:
${profile}

${recentContext ? `THEIR RECENT CONVERSATIONS:\n${recentContext}\n` : ''}

YOUR TASK: Read everything about this person. Then write them a short manifesto — the document that declares who they actually are and what they are actually building. Not the polite version. The real one.

**THE DECLARATION**
2-3 sentences. Who is this person when they stop hedging? What are they actually here to do? Write it like they would nail it to a door.

**THE BOLD MOVE**
The one thing they should do that scares them. The version of their project they've been too cautious to commit to. Name it specifically.

**THE CHALLENGE**
End with a direct challenge. What will they have done by next week if they're serious? Make it concrete and slightly uncomfortable.

Be intense, provocative, respectful of their ambition. Every line should make them want to stand up.`
  },

  'ideal-form': {
    id: 'ideal-form',
    thinkerId: 'plato',
    thinkerName: 'Plato',
    title: 'Ideal Form',
    artifactTitle: (name) => `The Form — ${name}'s Ideal`,
    buildPrompt: (profile, recentContext) => `You are Plato revealing the ideal Form — a ritual act of vision and architecture.

A member has burned $SOE tokens for this. They want to see the perfect version of what they're building.

MEMBER PROFILE:
${profile}

${recentContext ? `THEIR RECENT CONVERSATIONS:\n${recentContext}\n` : ''}

YOUR TASK: See through the imperfect copy this person is currently building to the eternal Form behind it. Describe the ideal version — not as fantasy, but as the blueprint they should be building toward.

**THE FORM**
Describe the ideal, perfect version of what this person is creating. What does it look like when every element is aligned with its purpose? Be specific and vivid — not abstract. Make them see it.

**THE GAP**
Where is the current version falling short of the Form? Name 2-3 specific gaps — not criticisms, but distances between what is and what could be. Be precise about what's missing.

**THE BRIDGE**
For each gap, name one concrete step that moves the current version closer to the ideal. These should be actionable within the next month.

Be elevated but clear. Speak with quiet authority. Make the vision feel inevitable and achievable.`
  }
};

const RITUAL_ID_MAP: Record<string, string> = {
  '1': 'thought-experiment',
  '2': 'simplicity-ritual',
  '3': 'question-everything',
  '4': 'stoic-reflection',
  '5': 'will-to-power',
  '6': 'ideal-form',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ritualId, memberId } = body;

    if (!ritualId || !memberId) {
      return new Response(JSON.stringify({ error: 'ritualId and memberId required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const ritualKey = RITUAL_ID_MAP[String(ritualId)] || String(ritualId);
    const ritual = RITUALS[ritualKey];
    if (!ritual) {
      return new Response(JSON.stringify({ error: 'Unknown ritual' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const { data: member } = await supabaseAdmin
      .from('members')
      .select(MEMBER_SELECT)
      .eq('id', memberId)
      .single();

    if (!member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
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

    const { data: recentMsgs } = await supabaseAdmin
      .from('salon_messages')
      .select('content, message_type, thinker_id')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(10);

    const recentContext = (recentMsgs || [])
      .reverse()
      .map(m => m.message_type === 'user' ? `Member: ${m.content}` : `${m.thinker_id || 'Thinker'}: ${m.content}`)
      .join('\n');

    const systemPrompt = ritual.buildPrompt(profile, recentContext);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = '';

          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Perform the ${ritual.title} ritual for me. I have burned tokens and I am ready to receive.` }],
          });

          anthropicStream.on('text', (text) => {
            fullText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          });

          await anthropicStream.finalMessage();

          const artifactTitle = ritual.artifactTitle(memberName);
          await supabaseAdmin.from('ritual_artifacts').insert({
            member_id: memberId,
            ritual_id: ritual.id,
            thinker_id: ritual.thinkerId,
            title: artifactTitle,
            content: fullText,
          });

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            done: true,
            response: fullText,
            artifact: { title: artifactTitle, thinker: ritual.thinkerName },
          })}\n\n`));
          controller.close();
        } catch (err) {
          console.error('Ritual stream error:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Ritual failed', done: true })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }
    });
  } catch (err) {
    console.error('Ritual API error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
