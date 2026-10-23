import { NextRequest, NextResponse } from 'next/server';

const PRIVATE_RESPONSE_CACHE_CONTROL = 'private, no-store, no-cache, max-age=0, must-revalidate';
const PRIVATE_RESPONSE_ROBOTS = 'noindex, nofollow, noarchive';
const PRIVATE_RESPONSE_REFERRER_POLICY = 'no-referrer';
const PRIVATE_RESPONSE_CROSS_ORIGIN_RESOURCE_POLICY = 'same-origin';

function appendVaryCookie(headers: Headers) {
  const current = headers.get('vary');
  if (!current) {
    headers.set('vary', 'Cookie');
    return;
  }

  const values = current
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.some((value) => value.toLowerCase() === 'cookie')) {
    values.push('Cookie');
    headers.set('vary', values.join(', '));
  }
}

function applyPrivateRouteHeaders(response: NextResponse) {
  response.headers.set('cache-control', PRIVATE_RESPONSE_CACHE_CONTROL);
  response.headers.set('surrogate-control', 'no-store');
  response.headers.set('pragma', 'no-cache');
  response.headers.set('expires', '0');
  response.headers.set('x-robots-tag', PRIVATE_RESPONSE_ROBOTS);
  response.headers.set('referrer-policy', PRIVATE_RESPONSE_REFERRER_POLICY);
  response.headers.set('cross-origin-resource-policy', PRIVATE_RESPONSE_CROSS_ORIGIN_RESOURCE_POLICY);
  response.headers.set('x-content-type-options', 'nosniff');
  appendVaryCookie(response.headers);
  return response;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protected routes
  const protectedRoutes = [
    '/salon',
    '/members',
    '/book',
    '/movement/memory',
    '/movement/personal-ai',
    '/movement/pod',
    '/movement/sovereignty',
    '/movement/studio',
    '/movement/voice-council',
  ];
  if (!protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  // Check Supabase session cookie: supports both chunked and non-chunked formats.
  const hasSupabaseSession = req.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'));

  // Check wallet cookie
  const walletId = req.cookies.get('soe_wallet_id');

  if (!hasSupabaseSession && !walletId) {
    return applyPrivateRouteHeaders(NextResponse.redirect(new URL('/', req.url)));
  }

  return applyPrivateRouteHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/salon/:path*',
    '/members/:path*',
    '/book/:path*',
    '/movement/memory/:path*',
    '/movement/personal-ai/:path*',
    '/movement/pod/:path*',
    '/movement/sovereignty/:path*',
    '/movement/studio/:path*',
    '/movement/voice-council/:path*',
  ],
};
