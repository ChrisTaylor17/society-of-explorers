let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let stream: MediaStream | null = null;

export async function startRecording(): Promise<void> {
  audioChunks = [];

  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
  });

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/mp4')
    ? 'audio/mp4'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.start(100);
}

export async function stopRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) return reject('No recorder');

    mediaRecorder.onstop = async () => {
      stream?.getTracks().forEach(t => t.stop());

      const mimeType = mediaRecorder?.mimeType || 'audio/webm';
      const blob = new Blob(audioChunks, { type: mimeType });

      if (blob.size < 1000) { resolve(''); return; }

      try {
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const data = await res.json();
        resolve(data.text || '');
      } catch (err) { reject(err); }
    };

    mediaRecorder.stop();
  });
}

export function isRecordingNow(): boolean {
  return mediaRecorder?.state === 'recording';
}
