import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '@/lib/claude/thinkers';
import { getMemory, recordInteraction } from '@/lib/thinkerMemory';
import { parseActions, executeThinkerAction } from '@/lib/thinkerActions';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { retrieveRelevantMemory, retrieveCrossThinkerMemory, storeConversationEmbedding } from '@/lib/memory/embeddings';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DIRECT_MAX_TOKENS = 600;
const COUNCIL_MAX_TOKENS = 400;
const DEMO_MAX_TOKENS = 200;
const ARTIFACT_MAX_TOKENS = 1200;
const REACTION_MAX_TOKENS = 80;
const HISTORY_LIMIT = 14;
const DEMO_MESSAGE_LIMIT = 7;

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
  const _startTime = Date.now();
  console.log('[thinker] start', _startTime);
  try {
    const body = await req.json();

    const isDemo = body.demo === true;
    const thinkerId = body.thinkerId ?? body.thinker;
    const message = body.message;
    const isReaction = body.isReaction ?? false;
    const walletMemberId = body.walletMemberId;
    const salonId = body.salonId ?? 'general';
    const councilContext: { thinker: string; response: string }[] = body.councilContext || [];

    if (!thinkerId || !message) {
      return new Response(
        JSON.stringify({ error: 'thinkerId and message are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // --- DEMO MODE: Socrates only, limited messages, no auth ---
    if (isDemo) {
      if (thinkerId !== 'socrates') {
        return Response.json({ error: 'Demo only available with Socrates' }, { status: 403 });
      }
      if (body.messages && body.messages.length > DEMO_MESSAGE_LIMIT) {
        return Response.json({ error: 'Demo limit reached' }, { status: 429 });
      }
    }

    // --- AUTH + FULL PROFILE FETCH (skip for demo) ---
    let memberId: string | null = null;
    let memberName: string | null = null;
    let memberContext: string | null = null;
    let memberExpTokens: number = 0;
    const isCouncilMode = body.isCouncilMode === true;

    if (!isDemo) {
      const auth = await getAuthenticatedMember(req);
      if (auth) {
        memberId = auth.memberId;
        memberName = auth.member.display_name;
        memberExpTokens = auth.member.exp_tokens || 0;
        memberContext = buildMemberContext(auth.member);
      }

      // Fallback: accept memberId from request body when cookie/token auth fails
      if (!memberId && (body.memberId || body.walletMemberId)) {
        const fallbackId = body.memberId || body.walletMemberId;
        const { data: m } = await supabaseAdmin.from('members').select(MEMBER_SELECT).eq('id', fallbackId).single();
        if (m) {
          memberId = m.id;
          memberName = m.display_name;
          memberExpTokens = m.exp_tokens || 0;
          memberContext = buildMemberContext(m);
        }
      }

      // Council mode allows anonymous usage (no member required)
      if (!memberId && !isCouncilMode) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // --- SAVE USER MESSAGE (skip for demo and system-generated prompts) ---
    if (!isDemo) {
      const isSystemPrompt = message.startsWith('A member recorded a 15-second Waddle') ||
        message.startsWith('You have been invited into a private conversation') ||
        message.startsWith('Here are my current tasks:') ||
        (message.includes('Respond as ') && message.includes(' — in character, direct'));

      if (!isSystemPrompt) {
        const { error: userMsgError } = await supabaseAdmin.from('salon_messages').insert({
          salon_id: salonId,
          sender_type: 'member',
          sender_name: memberName || 'Explorer',
          thinker_id: null,
          content: message,
        });
        if (userMsgError) console.error('USER MSG SAVE FAILED:', userMsgError);
      }
    }

    // --- FETCH MESSAGE HISTORY (skip for demo — use client-provided messages) ---
    let conversationHistory: { role: 'user' | 'assistant'; content: string }[];

    if (isDemo) {
      conversationHistory = (body.messages || []).map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      if (!conversationHistory.some(m => m.content === message)) {
        conversationHistory.push({ role: 'user', content: message });
      }
    } else {
      const { data: history } = await supabaseAdmin
        .from('salon_messages')
        .select('content, sender_type, thinker_id')
        .eq('salon_id', salonId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);

      conversationHistory = (history || [])
        .reverse()
        .map((msg) => ({
          role: msg.sender_type === 'member' ? 'user' as const : 'assistant' as const,
          content: msg.thinker_id && msg.sender_type === 'thinker'
            ? `[${msg.thinker_id}]: ${msg.content}`
            : msg.content,
        }));
    }

    // --- FETCH THINKER MEMORY (skip for demo and anonymous council) ---
    const memory = (isDemo || !memberId) ? null : await getMemory(memberId, thinkerId);

    // --- BUILD SYSTEM PROMPT (cap length for speed) ---
    let systemPrompt = buildSystemPrompt(thinkerId);
    if (systemPrompt.length > 2000) {
      systemPrompt = systemPrompt.slice(0, 2000) + '\n...[trimmed for speed]';
    }

    let maxTokens: number;
    if (isDemo) {
      maxTokens = DEMO_MAX_TOKENS;
    } else if (isReaction) {
      maxTokens = REACTION_MAX_TOKENS;
    } else if (isArtifactRequest(message)) {
      maxTokens = ARTIFACT_MAX_TOKENS;
    } else if (councilContext.length > 0) {
      maxTokens = COUNCIL_MAX_TOKENS;
    } else {
      maxTokens = DIRECT_MAX_TOKENS;
    }

    let fullSystemPrompt = systemPrompt;

    if (!isDemo) {
      const contextPrefix = memberContext
        ? memberContext
        : (memberName ? `The member speaking is ${memberName}.` : 'A member is speaking.');

      const usableName = (memberName && !memberName.startsWith('0x')) ? memberName : null;

      fullSystemPrompt += `\n\n${contextPrefix}`;
      if (usableName) {
        fullSystemPrompt += `\n\nIMPORTANT: The member's name is ${usableName}. Use their name naturally in your response. Never call them "Anonymous Explorer" or just "Explorer."`;
      }

      if (memory) {
        fullSystemPrompt += `\n\nYOUR MEMORY OF THIS MEMBER (from previous conversations):\n${memory}\n\nUse this memory naturally. Reference specific facts, commitments, and past conversations. If they committed to something, ask about progress. If they shared a struggle, check in. You are continuing a relationship — not starting from scratch.`;
      }

      // Vector memory: semantic search over past conversations
      if (memberId && !isReaction) {
        try {
          const [sameResults, crossResults] = await Promise.all([
            retrieveRelevantMemory({ memberId, thinkerKey: thinkerId, query: message, topK: 5 }),
            retrieveCrossThinkerMemory({ memberId, currentThinkerKey: thinkerId, query: message, topK: 3 }),
          ]);

          const thinkerNames: Record<string, string> = { socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche', aurelius: 'Aurelius', einstein: 'Einstein', jobs: 'Jobs' };
          let contextBlock = '';

          if (sameResults.length > 0) {
            const lines = sameResults.map(r => {
              const date = new Date(r.conversation_date).toLocaleDateString();
              return `- ${date}: ${r.content.slice(0, 120)}`;
            }).join('\n');
            contextBlock += `[From your past conversations with this member:]\n${lines}`;
          }

          if (crossResults.length > 0) {
            const lines = crossResults.map(r => {
              const date = new Date(r.conversation_date).toLocaleDateString();
              const name = thinkerNames[r.thinker_key] || r.thinker_key;
              return `- ${date} with ${name}: ${r.content.slice(0, 120)}`;
            }).join('\n');
            contextBlock += `\n\n[From their conversations with other thinkers:]\n${lines}`;
          }

          if (contextBlock) {
            fullSystemPrompt += `\n\n<RELEVANT_PAST_CONTEXT>\n${contextBlock}\n</RELEVANT_PAST_CONTEXT>`;
          }
        } catch (err) {
          console.error('[thinker] Vector memory lookup failed:', err);
        }
      }

      if (isReaction) {
        fullSystemPrompt += '\n\nYou are reacting to what another thinker just said. Keep your reaction to 1-2 sentences. Be substantive — agree, disagree, or build on their point. No pleasantries.';
      }

      if (councilContext.length > 0) {
        const ctxLines = councilContext.map(c => `[${c.thinker} said]: "${c.response}"`).join('\n');
        fullSystemPrompt += `\n\nCOUNCIL SESSION — Other thinkers have already responded to this question:\n${ctxLines}\n\nYou may engage with, challenge, or build on their ideas. Be direct. Name them by name. Don't repeat what they said — add your distinct perspective or push back. Keep your response concise (3-5 sentences).`;
      }
    } else {
      fullSystemPrompt += '\n\nThis is a brief demo conversation. Be concise and engaging. End your response by subtly inviting deeper exploration — the full Society experience awaits.';
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

          // --- PARSE ACTIONS (skip for demo) ---
          let cleanText: string;
          let actions: any[] = [];

          if (isDemo) {
            cleanText = fullText
              .replace(/^\[[\w-]+\]:\s*/i, '')
              .replace(/^\[[\w-]+\]\s*/i, '')
              .replace(/^(socrates):\s*/i, '')
              .trim();
          } else {
            const parsed = parseActions(fullText);
            actions = parsed.actions;
            cleanText = parsed.cleanText
              .replace(/^\[[\w-]+\]:\s*/i, '')
              .replace(/^\[[\w-]+\]\s*/i, '')
              .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs|steve-jobs):\s*/i, '')
              .trim();
          }

          // --- SAVE + EXP + MEMORY + ACTIONS (skip all for demo) ---
          if (!isDemo) {
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

            // Member-specific operations (skip for anonymous council)
            if (memberId) {
              for (const action of actions) {
                try {
                  await executeThinkerAction(action, memberId, thinkerId);
                } catch (e) {
                  console.error('Action execution failed:', action.type, e);
                }
              }

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

              const thinkerNames: Record<string, string> = {
                socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
                aurelius: 'Marcus Aurelius', einstein: 'Einstein', jobs: 'Steve Jobs',
              };
              recordInteraction(memberId, thinkerId, thinkerNames[thinkerId] || thinkerId, salonId)
                .catch(err => console.error('Memory update failed:', err));

              // Store embeddings for vector memory (fire and forget)
              storeConversationEmbedding({ memberId, thinkerKey: thinkerId, role: 'user', content: message })
                .catch(() => {});
              storeConversationEmbedding({ memberId, thinkerKey: thinkerId, role: 'assistant', content: cleanText })
                .catch(() => {});
            }
          }

          // --- SEND DONE + ACTIONS TO CLIENT ---
          if (!isDemo && actions.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'actions', actions })}\n\n`));
          }

          const doneData = JSON.stringify({
            done: true,
            response: cleanText,
            ...(!isDemo && {
              expAwarded: isReaction ? 4 : 8,
              actions: actions.length > 0 ? actions : undefined,
            }),
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

    console.log('[thinker] response complete', Date.now(), `(${Date.now() - _startTime}ms)`);
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
