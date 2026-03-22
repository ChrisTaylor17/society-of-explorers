import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protected routes
  const protected_routes = ['/salon', '/members', '/book']
  if (!protected_routes.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Check Supabase session cookie
  const supabaseSession = req.cookies.get('sb-woqvlkeluxkxplpgzdgv-auth-token')

  // Check wallet cookie
  const walletId = req.cookies.get('soe_wallet_id')

  if (!supabaseSession && !walletId) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/salon', '/members', '/book']
}
