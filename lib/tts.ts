// lib/tts.ts
// iOS-safe TTS with sentence chunking to prevent ElevenLabs cutoff

import { getSupabaseAccessToken } from '@/lib/auth/getSession';

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let stopRequested = false;
let playing = false;

type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const audioWindow = window as WebkitAudioWindow;
    const AC = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AC) throw new Error('AudioContext unavailable');
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
      const accessToken = await getSupabaseAccessToken();
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        cache: 'no-store',
        body: JSON.stringify({ text: chunk, thinkerId, consentToVoiceGeneration: true }),
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
