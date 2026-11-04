import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getSafeAuthRedirectPath } from '@/lib/auth/redirectPath'
import { selectAuthProvider } from '@/lib/auth/provider'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = getSafeAuthRedirectPath(searchParams.get('next'))

  if (code) {
    const completion = new URL('/auth/complete', origin)
    completion.searchParams.set('next', next)
    const response = NextResponse.redirect(completion)
    response.headers.set('cache-control', 'private, no-store')
    response.headers.set('referrer-policy', 'no-referrer')

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Set cookies on the response object — this is the key fix.
            // Using cookies() from next/headers silently fails in Route Handlers
            // because the response has already started streaming.
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('OAuth code exchange failed:', error)
      return NextResponse.redirect(new URL('/?auth_error=true', origin))
    }

    selectAuthProvider(response, 'supabase')
    return response
  }

  return NextResponse.redirect(new URL(next, origin))
}
