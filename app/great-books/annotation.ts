/** Consume only a complete, bounded annotation stream. Partial replies are never
 * presented as a completed interpretation. This module performs no requests. */
export async function readAnnotation(response: Response, signal: AbortSignal, current: () => boolean, onText: (text: string) => void): Promise<string> {
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Annotation stream unavailable');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', complete = false, bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  function event(raw: string) {
    const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid annotation event');
    const item = value as Record<string, unknown>;
    if (item.error) throw new Error('Annotation unavailable');
    if (typeof item.delta === 'string') text += item.delta;
    if (item.done === true) {
      if (typeof item.response === 'string') text = item.response;
      complete = true;
    }
    if (text.length > 20_000) throw new Error('Annotation exceeds display limit');
    if (current()) onText(text);
  }
  try {
    while (!complete) {
      const chunk = await reader.read();
      if (!current() || signal.aborted) throw new Error('Annotation retired');
      if (chunk.value) { bytes += chunk.value.byteLength; if (bytes > 100_000) throw new Error('Annotation stream exceeds limit'); }
      buffer = (buffer + decoder.decode(chunk.value, { stream: !chunk.done })).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); event(raw);
        if (complete) break;
      }
      if (chunk.done) { if (buffer.trim() && !complete) event(buffer); break; }
    }
    if (!complete || !text.trim() || !current()) throw new Error('Annotation reply incomplete');
    return text.trim();
  } finally { signal.removeEventListener('abort', cancel); void reader.cancel().catch(() => {}); }
}
