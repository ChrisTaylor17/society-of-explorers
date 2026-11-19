import type { NextRequest } from 'next/server';

import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 4_000;
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = 'whisper-1';

type TranscriptionProviderResponse = {
  text?: unknown;
};

function hasTranscriptionConsent(formData: FormData) {
  return formData.get('consentToTranscription') === 'true';
}

function normalizeAudio(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) return null;
  if (value.size <= 0 || value.size > MAX_AUDIO_BYTES) return null;
  if (value.type && !value.type.startsWith('audio/')) return null;
  return value;
}

function transcriptText(value: unknown) {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, MAX_TRANSCRIPT_CHARS);
}

function transcribeFailure(status = 502) {
  return privateJson({ error: 'Transcription unavailable' }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    if (!hasTranscriptionConsent(formData)) {
      return privateJson({ error: 'Transcription consent required' }, { status: 403 });
    }

    const audio = normalizeAudio(formData.get('audio'));
    if (!audio) return privateJson({ error: 'Invalid audio' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return transcribeFailure(503);

    const whisperForm = new FormData();
    whisperForm.append('file', audio, 'recording.webm');
    whisperForm.append('model', TRANSCRIPTION_MODEL);
    whisperForm.append('language', 'en');

    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!response.ok) return transcribeFailure();

    const data = (await response.json().catch(() => null)) as TranscriptionProviderResponse | null;
    const text = transcriptText(data?.text);
    if (text === null) return transcribeFailure();

    return privateJson({ text });
  } catch {
    return transcribeFailure(500);
  }
}
