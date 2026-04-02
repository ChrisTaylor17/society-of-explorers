import { NextRequest } from 'next/server';

const VOICE_MAP: Record<string, string> = {
  socrates: 'pNInz6obpgDQGcFmaJgB',
  plato: 'VR6AewLTigWG4xSOukaG',
  nietzsche: 'ErXwobaYiN019PkySvjV',
  aurelius: 'pNInz6obpgDQGcFmaJgB',
  einstein: 'VR6AewLTigWG4xSOukaG',
  'steve-jobs': 'ErXwobaYiN019PkySvjV',
};

export async function POST(req: NextRequest) {
  try {
    const { text, thinkerId } = await req.json();
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'TTS not configured' }), { status: 503 });

    const voiceId = VOICE_MAP[thinkerId] || 'pNInz6obpgDQGcFmaJgB';
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.substring(0, 500),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
      }),
    });

    if (!response.ok) {
      console.error('ElevenLabs error:', await response.text());
      return new Response(JSON.stringify({ error: 'TTS failed' }), { status: 502 });
    }

    return new Response(response.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    console.error('TTS error:', err);
    return new Response(JSON.stringify({ error: 'TTS error' }), { status: 500 });
  }
}
