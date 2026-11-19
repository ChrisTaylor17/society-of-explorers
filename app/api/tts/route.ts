import type { NextRequest } from 'next/server';

import { getThinkerProfile } from '@/lib/claude/thinkers';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';

const DEFAULT_VOICE = 'pNInz6obpgDQGcFmaJgB';
const MAX_TTS_TEXT_CHARS = 450;
const MAX_VOICE_ID_CHARS = 80;
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ELEVENLABS_TTS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

type TtsRequestBody = {
  text?: unknown;
  voiceId?: unknown;
  thinkerId?: unknown;
  consentToVoiceGeneration?: unknown;
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

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, MAX_TTS_TEXT_CHARS);
  return text || null;
}

function normalizeVoiceId(value: unknown) {
  if (typeof value !== 'string') return null;
  const voiceId = value.trim();
  if (!voiceId || voiceId.length > MAX_VOICE_ID_CHARS || !VOICE_ID_PATTERN.test(voiceId)) return null;
  return voiceId;
}

function resolveVoiceId(body: TtsRequestBody) {
  const explicitVoiceId = normalizeVoiceId(body.voiceId);
  if (explicitVoiceId) return explicitVoiceId;

  const profile = typeof body.thinkerId === 'string' ? getThinkerProfile(body.thinkerId) : null;
  return normalizeVoiceId(profile?.voiceId) || DEFAULT_VOICE;
}

function ttsFailure(status = 502) {
  return privateJson({ error: 'TTS unavailable' }, { status });
}

function privateAudioResponse(audioBuffer: ArrayBuffer) {
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': audioBuffer.byteLength.toString(),
      'cache-control': 'private, no-store, no-cache, max-age=0, must-revalidate',
      pragma: 'no-cache',
      expires: '0',
      vary: 'Authorization, Cookie',
      'accept-ranges': 'bytes',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!(await getAuthenticatedMember(req))) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await safeRequestJson(req);
    if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

    const body = parsed as TtsRequestBody;
    if (body.consentToVoiceGeneration !== true) {
      return privateJson({ error: 'Voice generation consent required' }, { status: 403 });
    }

    const text = normalizeText(body.text);
    if (!text) return privateJson({ error: 'Invalid text' }, { status: 400 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return ttsFailure(503);

    const response = await fetch(
      `${ELEVENLABS_TTS_BASE_URL}/${resolveVoiceId(body)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        }),
      },
    );

    if (!response.ok) return ttsFailure();

    const audioBuffer = await response.arrayBuffer();
    if (audioBuffer.byteLength <= 0) return ttsFailure();

    return privateAudioResponse(audioBuffer);
  } catch {
    return ttsFailure(500);
  }
}
