import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protected routes
  const protectedRoutes = ['/salon', '/members', '/book']
  if (!protectedRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Check Supabase session cookie — supports both chunked (v0.9+) and non-chunked formats
  const hasSupabaseSession = req.cookies.getAll().some(c =>
    c.name.startsWith('sb-') && c.name.includes('-auth-token')
  )

  // Check wallet cookie
  const walletId = req.cookies.get('soe_wallet_id')

  if (!hasSupabaseSession && !walletId) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/salon', '/members', '/book']
}
