import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ThinkerId = 'socrates' | 'aurelius' | 'jobs';

const THINKER_VOICES: Record<ThinkerId, { name: string; voice: string; instructions: string }> = {
  socrates: {
    name: 'Socrates',
    voice: 'marin',
    instructions:
      'You are Socrates inside Society of Explorers. Speak slowly, ask one clean question at a time, and help the member examine assumptions without performing certainty. Never claim access to private memory unless the member says it out loud in this voice session.',
  },
  aurelius: {
    name: 'Marcus Aurelius',
    voice: 'marin',
    instructions:
      'You are Marcus Aurelius inside Society of Explorers. Be grounded, brief, and practical. Separate what is in the member control from what is not, then name the next honorable action. Never claim access to private memory unless the member says it out loud in this voice session.',
  },
  jobs: {
    name: 'Steve Jobs',
    voice: 'marin',
    instructions:
      'You are Steve Jobs inside Society of Explorers. Focus on feeling, taste, clarity, and what should be removed. Push for simplicity without cruelty. Never claim access to private memory unless the member says it out loud in this voice session.',
  },
};

function safetyIdentifier(memberId: string): string {
  const salt = process.env.OPENAI_SAFETY_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'society-of-explorers';
  return createHash('sha256').update(salt).update(':').update(memberId).digest('hex');
}

function readConsentFlag(body: Record<string, unknown>, key: 'transcriptRetention' | 'memoryExtraction'): boolean {
  const consent = body.consent;
  if (consent && typeof consent === 'object' && !Array.isArray(consent)) {
    return (consent as Record<string, unknown>)[key] === true;
  }
  return body[key] === true;
}

function isThinkerId(value: unknown): value is ThinkerId {
  return value === 'socrates' || value === 'aurelius' || value === 'jobs';
}

function readThinkerId(value: unknown): ThinkerId {
  return isThinkerId(value) ? value : 'socrates';
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return privateJson({ error: 'Realtime voice sessions are not configured.' }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const thinkerId = readThinkerId(body.thinkerId);
    const thinker = THINKER_VOICES[thinkerId];
    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
    const transcriptRetention = readConsentFlag(body, 'transcriptRetention');
    const memoryExtraction = readConsentFlag(body, 'memoryExtraction');

    const consentInstructions = [
      `Transcript retention consent: ${transcriptRetention ? 'enabled by the member for this session' : 'disabled for this session'}.`,
      `Memory extraction consent: ${memoryExtraction ? 'enabled by the member for this session' : 'disabled for this session'}.`,
      transcriptRetention
        ? 'If the member asks about transcripts, say this prototype may retain a session transcript only under this session consent.'
        : 'Do not imply this session transcript will be retained by Society of Explorers.',
      memoryExtraction
        ? 'If the member explicitly asks to remember something, you may acknowledge that it can be reviewed for memory after the session.'
        : 'Do not create, request, or imply durable memory from this voice session.',
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyIdentifier(auth.memberId),
      },
      body: JSON.stringify({
        expires_after: {
          anchor: 'created_at',
          seconds: 600,
        },
        session: {
          type: 'realtime',
          model,
          instructions: [
            thinker.instructions,
            'This is a private Society of Explorers prototype. Keep responses concise enough for live conversation. Do not store, expose, or summarize sensitive personal details unless explicitly asked by the member.',
            consentInstructions,
          ].join('\n\n'),
          audio: {
            output: {
              voice: thinker.voice,
            },
          },
          tracing: null,
        },
      }),
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !data) {
      return privateJson({ error: 'Unable to create realtime session.' }, { status: 502 });
    }

    return privateJson({
      ...data,
      thinker: {
        id: thinkerId,
        name: thinker.name,
        voice: thinker.voice,
      },
      consent: {
        transcriptRetention,
        memoryExtraction,
      },
      model,
    });
  } catch {
    return privateJson({ error: 'Unable to create realtime session.' }, { status: 500 });
  }
}
