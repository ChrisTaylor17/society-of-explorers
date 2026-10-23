import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { buildSystemPrompt, getThinkerProfile } from '@/lib/claude/thinkers';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { limitModelCall } from '@/lib/rateLimit';
import { privateJson } from '@/lib/http/routeError';
import { getMemory } from '@/lib/thinkerMemory';
import { parseActions, executeThinkerAction } from '@/lib/thinkerActions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const VALID_THINKERS = new Set(['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CONTEXT_ITEM_LENGTH = 400;
const MAX_MEMBER_FIELD_LENGTH = 500;
const MAX_RESPONSE_TEXT_LENGTH = 2_000;
const MAX_TTS_LENGTH = 450;

type TwiddleRespondBody = {
  thinker_key?: unknown;
  voice?: unknown;
  consentToVoiceGeneration?: unknown;
  executeActions?: unknown;
  consentToExecuteActions?: unknown;
};

type TwiddleRow = {
  id: string;
  content: string | null;
  root_id: string | null;
  thread_type: string | null;
};

type ThreadMessageRow = {
  content: string | null;
  is_thinker_response: boolean | null;
  thinker_key: string | null;
  created_at: string | null;
};

type RecentTwiddleRow = {
  id: string;
  root_id: string | null;
  content: string | null;
  twiddle_type: string | null;
  thinker_tags: string[] | null;
};

type PastResponseRow = {
  content: string | null;
};

type ResponseTwiddleRow = {
  id: string;
};

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeThinkerKey(value: unknown) {
  return typeof value === 'string' && VALID_THINKERS.has(value) ? value : '';
}

function boundedText(value: unknown, maxLength = MAX_CONTEXT_ITEM_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function shouldGenerateVoice(body: TwiddleRespondBody) {
  return body.voice === true && body.consentToVoiceGeneration === true;
}

function shouldExecuteActions(body: TwiddleRespondBody) {
  return body.executeActions === true && body.consentToExecuteActions === true;
}

function getTextBlock(content: unknown) {
  if (!Array.isArray(content)) return '';
  const textBlock = content.find(
    (block): block is { type: 'text'; text: string } =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string',
  );
  return textBlock?.text.trim().slice(0, MAX_RESPONSE_TEXT_LENGTH) || '';
}

function cleanThinkerResponse(text: string) {
  return text
    .replace(/^\[?\w[\w-]*\]?:\s*/i, '')
    .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs):\s*/i, '')
    .trim()
    .slice(0, MAX_RESPONSE_TEXT_LENGTH);
}

function buildThreadContext(threadMsgs: ThreadMessageRow[] | null, fallbackContent: string) {
  const context = (threadMsgs || [])
    .slice()
    .reverse()
    .map((message) =>
      message.is_thinker_response
        ? `[${message.thinker_key || 'thinker'}]: ${boundedText(message.content)}`
        : `Member: ${boundedText(message.content)}`,
    )
    .filter(Boolean)
    .join('\n\n');

  return context ? `Thread context:\n${context}\n\nRespond to the latest message.` : fallbackContent;
}

function buildMemberContext(member: {
  display_name?: string | null;
  bio?: string | null;
  discipline?: string | null;
  project_description?: string | null;
  philosophy?: string | null;
}) {
  const name =
    member.display_name && !member.display_name.startsWith('0x')
      ? boundedText(member.display_name, 80)
      : 'Explorer';

  return [
    `The member speaking is ${name}. Address them by name.`,
    member.bio ? `Bio: ${boundedText(member.bio, MAX_MEMBER_FIELD_LENGTH)}` : null,
    member.discipline ? `Discipline: ${boundedText(member.discipline, MAX_MEMBER_FIELD_LENGTH)}` : null,
    member.project_description
      ? `Building: ${boundedText(member.project_description, MAX_MEMBER_FIELD_LENGTH)}`
      : null,
    member.philosophy ? `Philosophy: ${boundedText(member.philosophy, MAX_MEMBER_FIELD_LENGTH)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildRelationshipContext(recentTwiddles: RecentTwiddleRow[], pastResponses: PastResponseRow[]) {
  const recentPosts = recentTwiddles
    .map((twiddle) => {
      const tags = twiddle.thinker_tags?.length ? `, tagged: ${twiddle.thinker_tags.join(', ')}` : '';
      return `- "${boundedText(twiddle.content, 120)}" (${twiddle.twiddle_type || 'text'}${tags})`;
    })
    .join('\n');

  const pastReplies = pastResponses
    .map((response) => `- You said: "${boundedText(response.content, 120)}"`)
    .join('\n');

  if (!recentPosts && !pastReplies) return '';

  return [
    'RELATIONSHIP CONTEXT - use naturally, do not quote verbatim:',
    recentPosts ? `Their recent posts:\n${recentPosts}` : '',
    pastReplies ? `Your recent responses in their threads:\n${pastReplies}` : '',
    'Use this context only to make the reply more specific to this Explorer.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function loadRelationshipContext(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  authUserId: string | null,
  thinkerKey: string,
) {
  if (!authUserId) return '';

  const { data: recentRows } = await supabaseAdmin
    .from('twiddles')
    .select('id, root_id, content, twiddle_type, thinker_tags')
    .eq('author_id', authUserId)
    .eq('is_thinker_response', false)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentTwiddles = (recentRows || []) as RecentTwiddleRow[];
  const rootIds = Array.from(
    new Set(recentTwiddles.map((twiddle) => twiddle.root_id || twiddle.id).filter((id) => UUID_PATTERN.test(id))),
  );

  let pastResponses: PastResponseRow[] = [];
  if (rootIds.length > 0) {
    const { data: pastRows } = await supabaseAdmin
      .from('twiddles')
      .select('content')
      .eq('is_thinker_response', true)
      .eq('thinker_key', thinkerKey)
      .in('root_id', rootIds)
      .order('created_at', { ascending: false })
      .limit(3);
    pastResponses = (pastRows || []) as PastResponseRow[];
  }

  return buildRelationshipContext(recentTwiddles, pastResponses);
}

async function generateVoiceUrl({
  supabaseAdmin,
  id,
  thinkerKey,
  responseText,
}: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  id: string;
  thinkerKey: string;
  responseText: string;
}) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey || !responseText) return '';

  try {
    const profile = getThinkerProfile(thinkerKey);
    const voiceId = profile?.voiceId || 'pNInz6obpgDQGcFmaJgB';
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsKey,
      },
      body: JSON.stringify({
        text: responseText.slice(0, MAX_TTS_LENGTH),
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!ttsRes.ok) return '';

    const audioBuffer = await ttsRes.arrayBuffer();
    const filename = `thinker-responses/${id}/${thinkerKey}-${Date.now()}-${crypto.randomUUID()}.mp3`;
    const { data: upload } = await supabaseAdmin.storage
      .from('waddles')
      .upload(filename, audioBuffer, { contentType: 'audio/mpeg' });
    if (!upload) return '';

    const { data: urlData } = supabaseAdmin.storage.from('waddles').getPublicUrl(filename);
    return urlData.publicUrl;
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: 'Invalid twiddle' }, { status: 400 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body = parsed as TwiddleRespondBody;
  const thinkerKey = normalizeThinkerKey(body.thinker_key);
  if (!thinkerKey) return privateJson({ error: 'Invalid thinker_key' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  // Security fix S4: this route makes paid model calls (re-enabled by the UUID regex fix), so rate-limit it too.
  const limited = limitModelCall(req, auth.memberId, 'twiddle-respond');
  if (limited) return limited;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: twiddle } = await supabaseAdmin
    .from('twiddles')
    .select('id, content, root_id, thread_type')
    .eq('id', id)
    .single();
  if (!twiddle) return privateJson({ error: 'Twiddle not found' }, { status: 404 });

  const twiddleRow = twiddle as TwiddleRow;
  const rootId = twiddleRow.root_id && UUID_PATTERN.test(twiddleRow.root_id) ? twiddleRow.root_id : id;
  const { data: threadRows } = await supabaseAdmin
    .from('twiddles')
    .select('content, is_thinker_response, thinker_key, created_at')
    .or(`root_id.eq.${rootId},id.eq.${rootId}`)
    .order('created_at', { ascending: false })
    .limit(5);

  let memory = '';
  try {
    memory = (await getMemory(auth.memberId, thinkerKey)) || '';
  } catch {}

  const relationshipContext = await loadRelationshipContext(
    supabaseAdmin,
    auth.member.supabase_auth_id,
    thinkerKey,
  );

  let systemPrompt = buildSystemPrompt(thinkerKey);
  systemPrompt += `\n\n${buildMemberContext(auth.member)}`;
  if (memory) systemPrompt += `\n\nYOUR MEMORY OF THIS MEMBER:\n${memory}`;
  systemPrompt +=
    '\n\nYou have an ongoing relationship with this Explorer. Use relevant context naturally, never quote private context back verbatim, and keep responses to 2-4 specific sentences.';

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  if (relationshipContext) {
    messages.push({
      role: 'user',
      content: `[CONTEXT - do not repeat verbatim, use naturally]:\n${relationshipContext}`,
    });
    messages.push({
      role: 'assistant',
      content: 'Understood. I will use this context naturally and only when relevant.',
    });
  }

  messages.push({
    role: 'user',
    content: buildThreadContext((threadRows || []) as ThreadMessageRow[], boundedText(twiddleRow.content)),
  });

  try {
    const anthropic = createAnthropicClient();
    const model = resolveClaudeModel('content', 'claude-sonnet-4-20250514');
    const response = await anthropic.messages.create({
      model,
      max_tokens: 400,
      system: systemPrompt,
      messages,
    });

    const { cleanText, actions } = parseActions(getTextBlock(response.content));
    const responseText = cleanThinkerResponse(cleanText);
    if (!responseText) return privateJson({ error: 'Failed to generate Twiddle response' }, { status: 502 });

    let actionsExecuted = 0;
    if (shouldExecuteActions(body) && actions.length > 0) {
      for (const action of actions) {
        try {
          await executeThinkerAction(action, auth.memberId, thinkerKey);
          actionsExecuted += 1;
        } catch {}
      }
    }

    const { data: responseTwiddle, error } = await supabaseAdmin
      .from('twiddles')
      .insert({
        author_id: null,
        content: responseText,
        twiddle_type: 'text',
        thread_type: twiddleRow.thread_type || 'open',
        thinker_tags: [thinkerKey],
        parent_id: id,
        root_id: rootId,
        is_thinker_response: true,
        thinker_key: thinkerKey,
      })
      .select()
      .single();

    if (error || !responseTwiddle) {
      return privateJson({ error: 'Failed to save Twiddle response' }, { status: 500 });
    }

    const responseRow = responseTwiddle as ResponseTwiddleRow;
    const voiceUrl = shouldGenerateVoice(body)
      ? await generateVoiceUrl({ supabaseAdmin, id, thinkerKey, responseText })
      : '';

    if (voiceUrl) {
      await supabaseAdmin.from('twiddles').update({ voice_url: voiceUrl }).eq('id', responseRow.id);
    }

    return privateJson({
      twiddle: { ...responseTwiddle, voice_url: voiceUrl || undefined },
      actions,
      actionsExecuted,
      voiceGenerated: Boolean(voiceUrl),
    });
  } catch {
    return privateJson({ error: 'Failed to generate Twiddle response' }, { status: 500 });
  }
}
