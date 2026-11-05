import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirectPath'
import { selectAuthProvider } from '@/lib/auth/provider'
import { ordinaryCallbackIdentity } from '@/lib/auth/callbackSession'

function redirect(url: URL) {
  const response = NextResponse.redirect(url)
  response.headers.set('cache-control', 'private, no-store')
  response.headers.set('referrer-policy', 'no-referrer')
  response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
  return response
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const codes = searchParams.getAll('code')
  const next = getSafeAuthRedirectPath(searchParams.get('next'))
  const failed = () => redirect(new URL('/login?recovery=1&auth_error=1', origin))
  if (searchParams.has('error') || searchParams.has('error_code') || searchParams.has('error_description') ||
      searchParams.has('type') || codes.length > 1) return failed()
  if (!codes.length) return redirect(new URL(next, origin))
  if (!/^[A-Za-z0-9_-]{8,1024}$/.test(codes[0])) return failed()

  // AuthClient emits SIGNED_IN during exchange, including recovery exchanges.
  // Keep all SSR writes private until purpose and exact-token identity pass.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = []
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: cookies => { pendingCookies.push(...cookies) },
        },
      }
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(codes[0])
    const identity = error ? null : ordinaryCallbackIdentity(data)
    if (!identity) return failed()
    const proof = await supabase.auth.getUser(identity.token)
    if (proof.error || proof.data.user?.id !== identity.subject || !ordinaryCallbackIdentity(data)) return failed()

    const completion = new URL('/auth/complete', origin)
    completion.searchParams.set('next', next)
    const response = redirect(completion)
    pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    selectAuthProvider(response, 'supabase')
    return response
  } catch {
    // Do not log provider errors, callback codes or credentials.
    return failed()
  } finally {
    pendingCookies.length = 0
  }
}
