import 'server-only';

export function requestOrigin(url: Pick<URL, 'origin' | 'hostname' | 'port' | 'protocol'>, headers: Headers): string {
  // NextRequest rewrites loopback literals to localhost. Use the actual HTTP
  // authority for this case so the browser's distinct loopback origins stay distinct.
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === 'localhost') {
    const host = headers.get('host');
    const port = url.port ? `:${url.port}` : '';
    if (host === `127.0.0.1${port}` || host === `[::1]${port}`) return `${url.protocol}//${host}`;
  }
  return url.origin;
}

export function authWriteOriginAllowed(req: Request): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === requestOrigin(new URL(req.url), req.headers); } catch { return false; }
}

export async function readAuthJson(req: Request): Promise<Record<string, unknown> | null> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('body deadline')), 5_000); });
    for (;;) {
      const part = await Promise.race([reader.read(), expired]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) return null;
      chunks.push(part.value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null;
  } catch { return null; }
  finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
