// lib/tts.ts
// iOS-safe TTS playback via ElevenLabs proxy

const VOICE_IDS: Record<string, string> = {
  socrates: 'pNInz6obpgDQGcFmaJgB',
  plato: 'ErXwobaYiN019PkySvjV',
  nietzsche: 'VR6AewLTigWG4xSOukaG',
  aurelius: 'pqHfZKP75CvOlQylNhV4',
  einstein: 'SOYHLrjzK2X1ezoPC6cr',
  jobs: 'g5CIjZEefAph4nQFvHAz',
};

let currentAudio: HTMLAudioElement | null = null;

export async function speakText(text: string, thinkerId: string): Promise<void> {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }

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

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const audio = new Audio();
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');

  currentAudio = audio;
  audio.src = url;

  return new Promise((resolve, reject) => {
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; resolve(); };
    audio.onerror = (e) => { URL.revokeObjectURL(url); currentAudio = null; reject(e); };
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(err => { console.warn('Audio play failed (iOS gate):', err); reject(err); });
    }
  });
}

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
}

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
