// lib/tts.ts
// iOS-safe TTS with sentence chunking to prevent ElevenLabs cutoff

const VOICE_IDS: Record<string, string> = {
  socrates: 'pNInz6obpgDQGcFmaJgB',
  plato: 'ErXwobaYiN019PkySvjV',
  nietzsche: 'VR6AewLTigWG4xSOukaG',
  aurelius: 'pqHfZKP75CvOlQylNhV4',
  einstein: 'SOYHLrjzK2X1ezoPC6cr',
  jobs: 'g5CIjZEefAph4nQFvHAz',
};

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let stopRequested = false;
let playing = false;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function splitIntoChunks(text: string, maxChars = 400): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function speakText(text: string, thinkerId: string): Promise<void> {
  // Stop any current playback first, then reset the flag
  if (currentSource) {
    try { currentSource.stop(); } catch {}
    currentSource = null;
  }
  stopRequested = false;
  playing = false;

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/⬡/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\|\|\|ACTIONS\|\|\|[\s\S]*/g, '')
    .trim();

  if (!cleanText) return;

  const chunks = splitIntoChunks(cleanText, 400);
  const ctx = getAudioContext();
  playing = true;

  for (const chunk of chunks) {
    if (stopRequested) break;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk, thinkerId }),
      });

      if (!response.ok || stopRequested) continue;

      const arrayBuffer = await response.arrayBuffer();
      if (stopRequested) break;

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      if (stopRequested) break;

      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          currentSource = null;
          resolve();
        };
        currentSource = source;
        source.start(0);
      });
    } catch (err) {
      console.warn('TTS chunk failed:', err);
    }
  }

  playing = false;
  currentSource = null;
}

export function stopSpeaking() {
  stopRequested = true;
  if (currentSource) {
    try { currentSource.stop(); } catch {}
    currentSource = null;
  }
  playing = false;
}

export function isSpeaking(): boolean {
  return playing;
}
