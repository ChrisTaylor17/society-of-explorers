// lib/audioUnlock.ts
// iOS audio context unlock — call this on first user tap anywhere

let audioUnlocked = false;

export function unlockAudioContext() {
  if (audioUnlocked) return;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  audioUnlocked = true;
  ctx.close();
}

export function initAudioUnlock() {
  const unlock = () => {
    unlockAudioContext();
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('touchend', unlock, true);
    document.removeEventListener('click', unlock, true);
  };
  document.addEventListener('touchstart', unlock, true);
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click', unlock, true);
}
