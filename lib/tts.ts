// lib/tts.ts
// iOS-safe TTS playback via Web Audio API (bypasses HTMLAudioElement autoplay restrictions)

const VOICE_IDS: Record<string, string> = {
  socrates: 'pNInz6obpgDQGcFmaJgB',
  plato: 'ErXwobaYiN019PkySvjV',
  nietzsche: 'VR6AewLTigWG4xSOukaG',
  aurelius: 'pqHfZKP75CvOlQylNhV4',
  einstein: 'SOYHLrjzK2X1ezoPC6cr',
  jobs: 'g5CIjZEefAph4nQFvHAz',
};

// Persistent AudioContext — iOS closes contexts that aren't reused
let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let playing = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

export async function speakText(text: string, thinkerId: string): Promise<void> {
  stopSpeaking();

  const voiceId = VOICE_IDS[thinkerId] || VOICE_IDS.socrates;

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/⬡/g, '')
    .replace(/\[(.*?)\]/g, '$1')
    .slice(0, 500);

  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: cleanText, voiceId }),
  });

  if (!response.ok) throw new Error('TTS fetch failed');

  const arrayBuffer = await response.arrayBuffer();

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  currentSource = source;
  playing = true;

  return new Promise((resolve) => {
    source.onended = () => {
      currentSource = null;
      playing = false;
      resolve();
    };
    source.start(0);
  });
}

export function stopSpeaking() {
  if (currentSource) {
    try { currentSource.stop(); } catch {}
    currentSource = null;
  }
  playing = false;
}

export function isSpeaking(): boolean {
  return playing;
}
