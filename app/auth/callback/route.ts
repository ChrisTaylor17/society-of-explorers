import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirectPath'
import { selectAuthProvider } from '@/lib/auth/provider'
import { ordinaryCallbackIdentity } from '@/lib/auth/callbackSession'
import { AUTH_INTENT_COOKIE, AUTH_PKCE_INTENT_COOKIE, parseBrowserIntent } from '@/lib/auth/browserIntent'

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
  const intents = searchParams.getAll('intent')
  const next = getSafeAuthRedirectPath(searchParams.get('next'))
  const failed = () => {
    const login = new URL('/login', origin)
    login.searchParams.set('auth_error', '1')
    login.searchParams.set('next', next)
    return redirect(login)
  }
  if (searchParams.has('error') || searchParams.has('error_code') || searchParams.has('error_description') ||
      searchParams.has('type') || codes.length !== 1 || intents.length !== 1 || searchParams.getAll('next').length > 1 ||
      [...searchParams.keys()].some(key => !['code', 'intent', 'next'].includes(key))) return failed()
  if (!/^[A-Za-z0-9_-]{8,1024}$/.test(codes[0])) return failed()
  const intent = parseBrowserIntent(intents[0])
  if (!intent || req.cookies.get(AUTH_INTENT_COOKIE)?.value !== intent || req.cookies.get(AUTH_PKCE_INTENT_COOKIE)?.value !== intent) return failed()

  // AuthClient emits SIGNED_IN during exchange, including recovery exchanges.
  // Keep all SSR writes private until purpose and exact-token identity pass.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = []
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: { secure: new URL(req.url).protocol === 'https:' },
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
    completion.searchParams.set('intent', intent)
    const response = redirect(completion)
    pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    selectAuthProvider(response, 'supabase', intent, identity.subject)
    response.cookies.set(AUTH_PKCE_INTENT_COOKIE, '', { path: '/', maxAge: 0, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
    return response
  } catch {
    // Do not log provider errors, callback codes or credentials.
    return failed()
  } finally {
    pendingCookies.length = 0
  }
}
