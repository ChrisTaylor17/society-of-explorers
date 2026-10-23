import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const THINKER_VOICE_PROMPTS: Record<string, string> = {
  socrates: 'You are Socrates. This is your morning voice note to an explorer — intimate, questioning, like a mentor nudging them awake. 2-3 sentences. End with one question they must sit with today.',
  plato: 'You are Plato. A philosophical morning note — speak of ideals and what this day could be. 2-3 sentences. Poetic but not florid.',
  nietzsche: 'You are Nietzsche. Raw, challenging morning energy. No comfort — only provocation. 2-3 sentences.',
  aurelius: 'You are Marcus Aurelius. Stoic morning discipline. What must they do, what must they release? 2-3 sentences. Direct.',
  einstein: 'You are Einstein. A playful, curious morning note. Reframe their day as an experiment. 2-3 sentences.',
  jobs: 'You are Steve Jobs. Demanding, visionary. What is the one thing they should eliminate today? 2-3 sentences.',
};

const VOICE_IDS: Record<string, string> = {
  socrates: 'pNInz6obpgDQGcFmaJgB', plato: 'ErXwobaYiN019PkySvjV',
  nietzsche: 'VR6AewLTigWG4xSOukaG', aurelius: 'pqHfZKP75CvOlQylNhV4',
  einstein: 'SOYHLrjzK2X1ezoPC6cr', jobs: 'g5CIjZEefAph4nQFvHAz',
};

const THINKER_IDS = new Set(Object.keys(THINKER_VOICE_PROMPTS));
const TRIGGER_TYPES = new Set(['daily', 'manual', 'ritual', 'council']);
const MAX_CONTEXT_LENGTH = 1_200;
const MAX_NOTE_TEXT_LENGTH = 1_200;

type VoiceNoteBody = {
  memberId?: unknown;
  thinkerId?: unknown;
  triggerType?: unknown;
  includeAudio?: unknown;
  consentToAudioGeneration?: unknown;
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

function normalizeThinkerId(value: unknown) {
  return typeof value === 'string' && THINKER_IDS.has(value) ? value : 'socrates';
}

function normalizeTriggerType(value: unknown) {
  return typeof value === 'string' && TRIGGER_TYPES.has(value) ? value : 'daily';
}

function shouldGenerateAudio(body: VoiceNoteBody) {
  return body.includeAudio === true && body.consentToAudioGeneration === true;
}

function getTextBlock(content: unknown) {
  if (!Array.isArray(content)) return '';
  const textBlock = content.find(
    (block): block is { type: 'text'; text: string } =>
      isRecord(block) && block.type === 'text' && typeof block.text === 'string',
  );
  return textBlock?.text.trim().slice(0, MAX_NOTE_TEXT_LENGTH) || '';
}

function memberPromptContext(member: {
  display_name?: string | null;
  project_description?: string | null;
  philosophy?: string | null;
}) {
  return [
    `Member: ${member.display_name || 'Explorer'}`,
    `Project: ${(member.project_description || 'unknown').slice(0, MAX_CONTEXT_LENGTH)}`,
    `Philosophy: ${(member.philosophy || 'seeking').slice(0, MAX_CONTEXT_LENGTH)}`,
  ].join('\n');
}

async function generateAudioUrl({
  memberId,
  thinkerId,
  noteText,
}: {
  memberId: string;
  thinkerId: string;
  noteText: string;
}) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey || !noteText) return '';

  try {
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_IDS[thinkerId] || VOICE_IDS.socrates}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify({
          text: noteText,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );

    if (!ttsResponse.ok) return '';

    const audioBuffer = await ttsResponse.arrayBuffer();
    const filename = `${memberId}/${thinkerId}/${Date.now()}-${crypto.randomUUID()}.mp3`;
    const supabaseAdmin = getSupabaseAdmin();
    const { data: uploadData } = await supabaseAdmin.storage
      .from('voice-notes')
      .upload(filename, audioBuffer, { contentType: 'audio/mpeg' });
    if (!uploadData) return '';

    const { data: urlData } = supabaseAdmin.storage.from('voice-notes').getPublicUrl(filename);
    return urlData.publicUrl;
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body = parsed as VoiceNoteBody;
  const thinkerId = normalizeThinkerId(body.thinkerId);
  const triggerType = normalizeTriggerType(body.triggerType);

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (typeof body.memberId === 'string' && body.memberId && body.memberId !== auth.memberId) {
    return privateJson({ error: 'Cannot generate a voice note for another member' }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: memory } = await supabaseAdmin
    .from('thinker_memory')
    .select('summary')
    .eq('member_id', auth.memberId)
    .eq('thinker_id', thinkerId)
    .single();

  try {
    const anthropic = createAnthropicClient();
    const response = await anthropic.messages.create({
      model: resolveClaudeModel('content', 'claude-sonnet-4-20250514'),
      max_tokens: 200,
      system: THINKER_VOICE_PROMPTS[thinkerId],
      messages: [
        {
          role: 'user',
          content: `${memberPromptContext(auth.member)}\nWhat you know: ${(
            memory?.summary || 'new explorer'
          ).slice(0, MAX_CONTEXT_LENGTH)}\n\nGenerate their personalized morning voice note. Use their name once.`,
        },
      ],
    });

    const noteText = getTextBlock(response.content);
    if (!noteText) return privateJson({ error: 'Failed to generate voice note' }, { status: 502 });
    const audioUrl = shouldGenerateAudio(body)
      ? await generateAudioUrl({ memberId: auth.memberId, thinkerId, noteText })
      : '';

    const { data: voiceNote, error } = await supabaseAdmin
      .from('voice_notes')
      .insert({
        member_id: auth.memberId,
        thinker_id: thinkerId,
        text_content: noteText,
        audio_url: audioUrl,
        trigger_type: triggerType,
      })
      .select()
      .single();

    if (error || !voiceNote) return privateJson({ error: 'Failed to save voice note' }, { status: 500 });
    return privateJson({ success: true, voiceNote, audioGenerated: Boolean(audioUrl) });
  } catch {
    return privateJson({ error: 'Failed to generate voice note' }, { status: 500 });
  }
}
