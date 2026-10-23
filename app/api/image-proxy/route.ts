import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGIN = 'https://www.giovannidecunto.com';
const ALLOWED_PATH_PREFIX = '/wp-content/uploads/';
const ALLOWED_REFERER = `${ALLOWED_ORIGIN}/`;
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ERROR_CACHE_CONTROL = 'no-store';
const IMAGE_CACHE_CONTROL = 'public, max-age=86400';
const CROSS_ORIGIN_RESOURCE_POLICY = 'same-origin';
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return imageProxyError('Missing url', 400);
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(rawUrl);
  } catch {
    return imageProxyError('Invalid url', 400);
  }

  if (
    upstreamUrl.protocol !== 'https:' ||
    upstreamUrl.origin !== ALLOWED_ORIGIN ||
    !upstreamUrl.pathname.startsWith(ALLOWED_PATH_PREFIX)
  ) {
    return imageProxyError('Forbidden', 403);
  }

  let res: Response;
  try {
    res = await fetch(upstreamUrl, {
      headers: { Referer: ALLOWED_REFERER },
      redirect: 'error',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return imageProxyError('Upstream fetch failed', 502);
  }

  if (!res.ok) {
    return imageProxyError('Upstream image unavailable', 502);
  }

  const contentType = normalizeContentType(res.headers.get('content-type'));
  if (!contentType) {
    return imageProxyError('Unsupported upstream content', 415);
  }

  const contentLengthHeader = res.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;
  if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength > MAX_IMAGE_BYTES)) {
    return imageProxyError('Upstream image too large', 413);
  }

  if (!res.body) {
    return imageProxyError('Upstream image stream unavailable', 502);
  }

  let body: ArrayBuffer;
  try {
    body = await readLimitedBody(res.body, MAX_IMAGE_BYTES);
  } catch (error) {
    if (error instanceof ImageTooLargeError) {
      return imageProxyError('Upstream image too large', 413);
    }

    return imageProxyError('Upstream image stream unavailable', 502);
  }

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': IMAGE_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': CROSS_ORIGIN_RESOURCE_POLICY,
      'Content-Length': String(body.byteLength),
    },
  });
}

class ImageTooLargeError extends Error {}

function imageProxyError(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      'Cache-Control': ERROR_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': CROSS_ORIGIN_RESOURCE_POLICY,
    },
  });
}

function normalizeContentType(value: string | null) {
  const contentType = value?.split(';', 1)[0]?.trim().toLowerCase() || '';
  return ALLOWED_CONTENT_TYPES.has(contentType) ? contentType : null;
}

async function readLimitedBody(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ImageTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(body);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}
