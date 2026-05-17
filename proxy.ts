import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protected routes
  const protectedRoutes = ['/salon', '/members', '/book'];
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
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/salon/:path*', '/members/:path*', '/book/:path*'],
};
