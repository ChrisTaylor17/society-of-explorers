import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '@/lib/claude/thinkers';
import { getMemory, recordInteraction } from '@/lib/thinkerMemory';
import { parseActions, executeThinkerAction } from '@/lib/thinkerActions';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DIRECT_MAX_TOKENS = 400;
const ARTIFACT_MAX_TOKENS = 1200;
const REACTION_MAX_TOKENS = 80;
const HISTORY_LIMIT = 14;

const ARTIFACT_KEYWORDS = ['draft', 'write', 'plan', 'outline', 'create', 'build', 'design', 'manifesto', 'pitch', 'letter', 'framework', 'strategy', 'proposal'];

function isArtifactRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return ARTIFACT_KEYWORDS.some(kw => lower.includes(kw));
}

function buildMemberContext(m: any): string {
  let name = 'Explorer';
  if (m.display_name && !m.display_name.startsWith('0x')) {
    name = m.display_name;
  } else if (m.display_name?.startsWith('0x')) {
    name = `Explorer (wallet ${m.display_name.slice(0, 6)}...)`;
  }
  return [
    `The member speaking is ${name}. Address them by name.`,
    m.bio ? `Bio: ${m.bio}` : null,
    m.discipline ? `Discipline: ${m.discipline}` : null,
    m.skills?.length ? `Skills: ${m.skills.join(', ')}` : null,
    m.project_description ? `Building: ${m.project_description}` : null,
    m.seeking ? `Seeking: ${m.seeking}` : null,
    m.philosophy ? `Philosophy: ${m.philosophy}` : null,
  ].filter(Boolean).join('\n');
}

const MEMBER_SELECT = 'id, display_name, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const thinkerId = body.thinkerId ?? body.thinker;
    const message = body.message;
    const isReaction = body.isReaction ?? false;
    const walletMemberId = body.walletMemberId;
    const salonId = body.salonId ?? 'general';

    if (!thinkerId || !message) {
      return new Response(
        JSON.stringify({ error: 'thinkerId and message are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- AUTH + FULL PROFILE FETCH ---
    let memberId: string | null = null;
    let memberName: string | null = null;
    let memberContext: string | null = null;
    let memberExpTokens: number = 0;

    const authHeader = req.headers.get('authorization');

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { createClient: createServerClient } = await import('@supabase/supabase-js');
      const supabaseAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user) {
        const { data: member } = await supabaseAdmin
          .from('members')
          .select(MEMBER_SELECT)
          .eq('supabase_auth_id', user.id)
          .single();
        if (member) {
          memberId = member.id;
          memberName = member.display_name;
          memberExpTokens = member.exp_tokens || 0;
          memberContext = buildMemberContext(member);
        }
      }
    }

    if (!memberId && walletMemberId) {
      const { data: member } = await supabaseAdmin
        .from('members')
        .select(MEMBER_SELECT)
        .eq('id', walletMemberId)
        .single();
      if (member) {
        memberId = member.id;
        memberName = member.display_name;
        memberExpTokens = member.exp_tokens || 0;
        memberContext = buildMemberContext(member);
      }
    }

    if (!memberId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- SAVE USER MESSAGE ---
    // Save user message — use same columns as /api/salon-message (which works)
    const { error: userMsgError } = await supabaseAdmin.from('salon_messages').insert({
      salon_id: salonId,
      sender_type: 'member',
      sender_name: memberName || 'Explorer',
      thinker_id: null,
      content: message,
    });
    if (userMsgError) console.error('USER MSG SAVE FAILED:', userMsgError);

    // --- FETCH MESSAGE HISTORY ---
    const { data: history } = await supabaseAdmin
      .from('salon_messages')
      .select('content, sender_type, thinker_id')
      .eq('salon_id', salonId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    const conversationHistory = (history || [])
      .reverse()
      .map((msg) => ({
        role: msg.sender_type === 'member' ? 'user' as const : 'assistant' as const,
        content: msg.thinker_id && msg.sender_type === 'thinker'
          ? `[${msg.thinker_id}]: ${msg.content}`
          : msg.content,
      }));

    // --- FETCH THINKER MEMORY ---
    const memory = await getMemory(memberId, thinkerId);

    // --- BUILD SYSTEM PROMPT ---
    const systemPrompt = buildSystemPrompt(thinkerId);

    let maxTokens = isReaction ? REACTION_MAX_TOKENS : DIRECT_MAX_TOKENS;
    if (!isReaction && isArtifactRequest(message)) {
      maxTokens = ARTIFACT_MAX_TOKENS;
    }

    const contextPrefix = memberContext
      ? memberContext
      : (memberName ? `The member speaking is ${memberName}.` : 'A member is speaking.');

    // Resolve a usable name for the member
    const usableName = (memberName && !memberName.startsWith('0x')) ? memberName : null;

    let fullSystemPrompt = `${systemPrompt}\n\n${contextPrefix}`;
    if (usableName) {
      fullSystemPrompt += `\n\nIMPORTANT: The member's name is ${usableName}. Use their name naturally in your response. Never call them "Anonymous Explorer" or just "Explorer."`;
    }

    if (memory) {
      fullSystemPrompt += `\n\nYOUR MEMORY OF THIS MEMBER (from previous conversations):\n${memory}\n\nUse this memory naturally. Reference past conversations when relevant — "Last time we talked about X" or "You mentioned Y before." Don't announce that you have memory. Just know what you know, the way a trusted advisor remembers.`;
    }

    if (isReaction) {
      fullSystemPrompt += '\n\nYou are reacting to what another thinker just said. Keep your reaction to 1-2 sentences. Be substantive — agree, disagree, or build on their point. No pleasantries.';
    }

    // --- STREAM RESPONSE ---
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = '';

          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: maxTokens,
            system: fullSystemPrompt,
            messages: conversationHistory.length > 0
              ? conversationHistory
              : [{ role: 'user', content: message }],
          });

          anthropicStream.on('text', (text) => {
            fullText += text;
            const data = JSON.stringify({ delta: text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });

          await anthropicStream.finalMessage();

          if (fullText.trim().toUpperCase().startsWith('SILENT')) {
            const doneData = JSON.stringify({ done: true, response: '', silent: true });
            controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
            controller.close();
            return;
          }

          // --- PARSE ACTIONS ---
          const { cleanText: rawClean, actions } = parseActions(fullText);
          // Strip any "[thinkerId]: " prefix that Claude may echo from history
          // Strip any "[thinkerId]: " prefix that Claude echoes from conversation history
          const cleanText = rawClean
            .replace(/^\[[\w-]+\]:\s*/i, '')
            .replace(/^\[[\w-]+\]\s*/i, '')
            .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs|steve-jobs):\s*/i, '')
            .trim();

          // --- SAVE THINKER RESPONSE (clean text only, no action JSON) ---
          const thinkerDisplayNames: Record<string, string> = {
            socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
            aurelius: 'Aurelius', einstein: 'Einstein', jobs: 'Jobs',
          };
          const { error: saveError } = await supabaseAdmin.from('salon_messages').insert({
            salon_id: salonId,
            sender_type: 'thinker',
            sender_name: thinkerDisplayNames[thinkerId] || thinkerId,
            thinker_id: thinkerId,
            content: cleanText,
          });
          if (saveError) console.error('THINKER SAVE FAILED:', saveError);
          else console.log('THINKER SAVED OK:', { salonId, thinkerId, len: cleanText.length });

          // --- EXECUTE ACTIONS ---
          for (const action of actions) {
            try {
              await executeThinkerAction(action, memberId!, thinkerId);
            } catch (e) {
              console.error('Action execution failed:', action.type, e);
            }
          }

          // --- AWARD EXP TOKENS ---
          const expAmount = isReaction ? 4 : 8;
          await supabaseAdmin.from('exp_events').insert({
            member_id: memberId,
            amount: expAmount,
            reason: isReaction
              ? `Thinker reaction from ${thinkerId}`
              : `Conversation with ${thinkerId}`,
          });

          const { error: rpcError } = await supabaseAdmin.rpc('increment_exp', {
            member_id_input: memberId,
            amount_input: expAmount,
          });
          if (rpcError) {
            await supabaseAdmin
              .from('members')
              .update({ exp_tokens: (memberExpTokens || 0) + expAmount })
              .eq('id', memberId);
          }

          // --- UPDATE THINKER MEMORY (fire-and-forget) ---
          const thinkerNames: Record<string, string> = {
            socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
            aurelius: 'Marcus Aurelius', einstein: 'Einstein', jobs: 'Steve Jobs',
          };
          recordInteraction(memberId, thinkerId, thinkerNames[thinkerId] || thinkerId, salonId)
            .catch(err => console.error('Memory update failed:', err));

          // --- SEND DONE + ACTIONS TO CLIENT ---
          if (actions.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'actions', actions })}\n\n`));
          }

          const doneData = JSON.stringify({
            done: true,
            response: cleanText,
            expAwarded: expAmount,
            actions: actions.length > 0 ? actions : undefined,
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.close();
        } catch (err) {
          console.error('Thinker stream error:', err);
          const errorData = JSON.stringify({
            error: 'Stream failed',
            done: true,
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Thinker API error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
