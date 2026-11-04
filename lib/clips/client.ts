import { MAX_CAPTION_BYTES, MAX_CLIP_BYTES } from './contracts';

/** The user explicitly starts this read. Never follows redirects or sends
 * account cookies; each bounded response must match the reviewed exact hash. */
export async function fetchClipBytes(href: string, sha: string, length: number, mime: string, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const maximum = mime === 'text/vtt' ? MAX_CAPTION_BYTES : MAX_CLIP_BYTES;
  if (!Number.isSafeInteger(length) || length < 1 || length > maximum || !/^\/clips\/(?:media|captions)\/[a-z0-9-]+\?sha=[0-9a-f]{64}$/u.test(href)) throw Error('Invalid reviewed clip');
  const response = await fetch(href, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
  if (!response.ok || response.status !== 200 || response.headers.get('content-type')?.split(';')[0] !== mime
    || response.headers.get('content-length') !== String(length) || !response.body) throw Error('Clip unavailable');
  const reader = response.body.getReader(), output = new Uint8Array(length);
  let offset = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) throw Error('Clip read retired');
      if (part.done) break;
      if (offset + part.value.byteLength > length) throw Error('Clip exceeds reviewed size');
      output.set(part.value, offset); offset += part.value.byteLength;
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  if (offset !== length) throw Error('Clip bytes changed');
  const digest = await crypto.subtle.digest('SHA-256', output);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (signal.aborted || actual !== sha) throw Error('Clip bytes changed');
  return output;
}
