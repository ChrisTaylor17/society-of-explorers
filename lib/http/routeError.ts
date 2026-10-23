import { NextResponse } from 'next/server';

type JsonInit = {
  status?: number;
  headers?: HeadersInit;
};

type AttachmentInit = JsonInit & {
  filename: string;
};

function sanitizeAttachmentFilename(filename: string): string {
  const cleaned = filename
    .trim()
    .replace(/[\\\/]+/g, '-')
    .replace(/[\r\n"]/g, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[-. ]+|[-. ]+$/g, '');

  return cleaned || 'download.json';
}

function appendVary(headers: Headers, token: string) {
  const current = headers.get('vary');
  if (!current) {
    headers.set('vary', token);
    return;
  }

  const values = current
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.some((value) => value.toLowerCase() === token.toLowerCase())) {
    values.push(token);
    headers.set('vary', values.join(', '));
  }
}

export function privateJson(body: unknown, init: JsonInit = {}) {
  const response = NextResponse.json(body, init);
  applyPrivateHeaders(response.headers);
  return response;
}

export function privateAttachmentJson(body: unknown, init: AttachmentInit) {
  const filename = sanitizeAttachmentFilename(init.filename);
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('content-disposition', `attachment; filename="${filename}"`);

  const response = new NextResponse(JSON.stringify(body, null, 2), {
    status: init.status,
    headers,
  });
  applyPrivateHeaders(response.headers);
  return response;
}

export function privateEventStreamHeaders(init: HeadersInit = {}) {
  const headers = new Headers(init);
  headers.set('content-type', 'text/event-stream; charset=utf-8');
  headers.set('cache-control', 'private, no-store, no-cache, max-age=0, must-revalidate, no-transform');
  headers.set('connection', 'keep-alive');
  applyPrivateHeaders(headers);
  return headers;
}

function applyPrivateHeaders(target: NextResponse | Headers) {
  const headers = target instanceof Headers ? target : target.headers;

  headers.set('surrogate-control', 'no-store');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('content-security-policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  headers.set('x-frame-options', 'DENY');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('cross-origin-resource-policy', 'same-origin');
  appendVary(headers, 'Cookie');
  appendVary(headers, 'Authorization');

  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  }
}

export function internalRouteError(message: string, status = 500) {
  return privateJson({ error: message }, { status });
}
