import { byteRange } from '@/lib/http/byteRange';
import { privateResourceHeaders } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { getSupabaseAdmin, getSupabaseAdminConfig } from '@/lib/supabase/admin';
import { hasPrivateWaddleBucket, MAX_AUDIO_BYTES, WADDLE_AUDIO_MIME, WADDLE_BUCKET, waddleAudioObject } from '@/lib/waddle/media';

function isWebm(response: Response) {
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const encoding = response.headers.get('content-encoding');
  return type === WADDLE_AUDIO_MIME && (!encoding || encoding === 'identity');
}

function verifiedLength(body: ReadableStream<Uint8Array>, length: number) {
  let remaining = length;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      remaining -= chunk.byteLength;
      if (remaining < 0) throw new Error('Unexpected Waddle audio length');
      controller.enqueue(chunk);
    },
    flush() {
      if (remaining) throw new Error('Incomplete Waddle audio');
    },
  }));
}

async function audioResource(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = privateResourceHeaders({ 'Cache-Control': 'private, no-store, no-transform' });
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  const unavailable = (status: number) => new Response(null, { status, headers });
  const { id } = await params;
  if (!isUuid(id)) return unavailable(404);

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('waddles').select('audio_url,member_id')
      .eq('id', id).eq('is_public', true).not('public_consent_at', 'is', null).maybeSingle();
    if (error) return unavailable(503);
    const key = waddleAudioObject(data?.audio_url, data?.member_id);
    if (!key) return unavailable(404);
    if (!await hasPrivateWaddleBucket(admin.storage)) return unavailable(503);

    // The private object endpoint preserves status and byte-range headers that the SDK download omits.
    const { url, serviceRoleKey } = getSupabaseAdminConfig();
    const objectUrl = new URL(`/storage/v1/object/authenticated/${WADDLE_BUCKET}/${key}`, url);
    const storageHeaders = new Headers({ apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Accept-Encoding': 'identity' });
    const init = {
      headers: storageHeaders, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    } as const;
    const metadata = await fetch(objectUrl, { ...init, method: 'HEAD' });
    if (metadata.status === 404) return unavailable(404);
    const lengthHeader = metadata.headers.get('content-length') ?? '';
    const length = Number(lengthHeader);
    if (metadata.status !== 200 || !isWebm(metadata) || !/^[1-9]\d{0,7}$/.test(lengthHeader) || length > MAX_AUDIO_BYTES) {
      return unavailable(503);
    }

    const etag = metadata.headers.get('etag');
    const ifRange = request.headers.get('if-range');
    const range = request.method === 'GET' && (!ifRange || (ifRange === etag && !ifRange.startsWith('W/')))
      ? byteRange(request.headers.get('range'), length)
      : null;
    headers.set('Accept-Ranges', 'bytes');
    if (range === 'invalid') {
      headers.set('Content-Range', `bytes */${length}`);
      return unavailable(416);
    }

    const start = range?.[0] ?? 0;
    const end = range?.[1] ?? length - 1;
    const expectedLength = end - start + 1;
    const expectedRange = range ? `bytes ${start}-${end}/${length}` : null;
    const status = range ? 206 : 200;
    let body: ReadableStream<Uint8Array> | null = null;
    if (request.method === 'GET') {
      if (range) storageHeaders.set('Range', `bytes=${start}-${end}`);
      if (etag && !etag.startsWith('W/')) storageHeaders.set('If-Match', etag);
      const audio = await fetch(objectUrl, init);
      if (audio.status !== status || !audio.body || !isWebm(audio) ||
          audio.headers.get('content-length') !== String(expectedLength) || audio.headers.get('content-range') !== expectedRange ||
          (etag && audio.headers.get('etag') !== etag)) {
        await audio.body?.cancel();
        return unavailable(audio.status === 404 ? 404 : 503);
      }
      body = verifiedLength(audio.body, expectedLength);
    }

    headers.set('Content-Type', WADDLE_AUDIO_MIME);
    headers.set('Content-Length', String(expectedLength));
    if (etag) headers.set('ETag', etag);
    if (expectedRange) headers.set('Content-Range', expectedRange);
    return new Response(body, { status, headers });
  } catch {
    return unavailable(503);
  }
}

export { audioResource as GET, audioResource as HEAD };
