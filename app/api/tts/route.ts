import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, thinkerId } = await req.json();
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'TTS not configured' }, { status: 503 });

    // Support both voiceId directly and thinkerId lookup
    const VOICE_MAP: Record<string, string> = {
      socrates: 'pNInz6obpgDQGcFmaJgB',
      plato: 'ErXwobaYiN019PkySvjV',
      nietzsche: 'VR6AewLTigWG4xSOukaG',
      aurelius: 'pqHfZKP75CvOlQylNhV4',
      einstein: 'SOYHLrjzK2X1ezoPC6cr',
      jobs: 'g5CIjZEefAph4nQFvHAz',
    };

    const resolvedVoiceId = voiceId || VOICE_MAP[thinkerId] || 'pNInz6obpgDQGcFmaJgB';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: (text || '').slice(0, 450),
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs error:', err);
      return NextResponse.json({ error: err }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
  }
}
