/** Read signed bytes without parsing or changing the payload. */
export class WebhookBodyFailure extends Error {
  constructor(public readonly status: 400 | 413) { super('Webhook body unavailable'); }
}

export async function readWebhookBody(request: Request): Promise<Uint8Array> {
  const maximum = 1_000_000;
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maximum) throw new WebhookBodyFailure(413);
  if (!request.body) {
    const bytes = new TextEncoder().encode(await request.text());
    if (bytes.byteLength > maximum) throw new WebhookBodyFailure(413);
    return bytes;
  }
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximum) {
        void reader.cancel().catch(() => {});
        throw new WebhookBodyFailure(413);
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof WebhookBodyFailure) throw error;
    throw new WebhookBodyFailure(400);
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  return bytes;
}
